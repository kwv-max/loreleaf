// 화마다 달라지는 설정.
// 설정 항목(field)은 처음 값(value)과, "n화부터 이렇게 바뀜" 기록(changes)을 가진다.
//   field = { id, label, value, changes?: [{ id, chapterId, value }] }
// 어떤 화 시점의 값 = 그 화까지의 기록 중 가장 늦은 것, 없으면 처음 값.
import { h, sheet, autogrow, toast } from './ui.js';
import { db, put, uid, chaptersOf, recordStore, sidesFor, otherOf } from './store.js';
import { buildMatcher } from './highlight.js';
import { emit } from './guide.js';

// 작품의 화 순서: chapterId → 0, 1, 2 ...
export const orderOf = (wid) => new Map(chaptersOf(wid).map((c, i) => [c.id, i]));

// 시점 at(화 순서 번호, 끝까지면 Infinity)의 값과 그 값이 어디서 왔는지
export function valueAt(f, at, order) {
  let rec = null, idx = -1;
  for (const c of f.changes || []) {
    const i = order.get(c.chapterId);
    if (i == null || i > at || i < idx) continue;
    rec = c;
    idx = i;
  }
  return rec ? { value: rec.value, rec, idx } : { value: f.value, rec: null, idx: -1 };
}

// 처음 값부터 화 순서대로 늘어놓은 기록 (없어진 화의 기록은 뺀다)
export function historyOf(f, order) {
  return [
    { rec: null, idx: -1, value: f.value },
    ...(f.changes || [])
      .filter((c) => order.has(c.chapterId))
      .map((c) => ({ rec: c, idx: order.get(c.chapterId), value: c.value }))
      .sort((a, b) => a.idx - b.idx),
  ];
}

export const hasChanges = (e) => e.fields.some((f) => f.changes?.length);

// 이 화에서 바뀐 설정들: [{ entry, field, change }]
export function changesIn(wid, cid) {
  const out = [];
  for (const e of db.entries.values()) {
    if (e.workId !== wid) continue;
    for (const f of e.fields) for (const c of f.changes || []) if (c.chapterId === cid) out.push({ entry: e, field: f, change: c });
  }
  // 관계: 바뀐 쪽을 보는 사람의 설정으로 친다 (예: 유나 · 관계: 미로)
  for (const r of db.relations.values()) {
    if (r.workId !== wid) continue;
    for (const me of r.pair) {
      const [mine] = sidesFor(r, me);
      const c = (mine.changes || []).find((x) => x.chapterId === cid);
      const entry = db.entries.get(me), other = db.entries.get(otherOf(r, me));
      if (c && entry && other) out.push({ entry, field: { label: `관계: ${other.name}` }, change: c, relation: r });
    }
  }
  return out;
}

// cid 화 바로 앞까지의 값
export function valueBefore(f, cid, order) {
  return valueAt(f, (order.get(cid) ?? Infinity) - 1, order).value;
}
export const sameValue = (a, b) => (a || '').trim() === (b || '').trim();

// 앞 화와 똑같은 값인 기록은 바뀐 게 아니니 없앤다. 화 순서대로 훑으니
// 1·3화가 같고 2화만 달랐는데 2화를 되돌리면 3화 기록도 함께 정리된다. 없앤 기록 수를 돌려준다.
export function pruneSame(f, order) {
  let prev = f.value;
  const keep = [];
  for (const c of [...(f.changes || [])].sort((a, b) => (order.get(a.chapterId) ?? Infinity) - (order.get(b.chapterId) ?? Infinity))) {
    if (order.has(c.chapterId) && sameValue(c.value, prev)) continue;
    keep.push(c);
    if (order.has(c.chapterId)) prev = c.value;
  }
  const n = (f.changes || []).length - keep.length;
  if (n) f.changes = (f.changes || []).filter((c) => keep.includes(c)); // 원래 순서 유지
  return n;
}

// cid 화부터 value로 바뀜 (같은 화 기록이 있으면 덮어쓴다). 정리로 없앤 기록 수를 돌려준다.
export function setChange(e, f, cid, value) {
  f.changes ||= [];
  const hit = f.changes.find((c) => c.chapterId === cid);
  if (hit) hit.value = value;
  else f.changes.push({ id: uid(), chapterId: cid, value });
  const n = pruneSame(f, orderOf(e.workId));
  put(recordStore(e), e);
  return n;
}

export function removeChange(e, f, rec) {
  f.changes = (f.changes || []).filter((c) => c !== rec);
  const n = pruneSame(f, orderOf(e.workId));
  put(recordStore(e), e);
  return n;
}

// ---- 지금 보고 있는 시점 ----
// 글을 쓰다가 설정을 보러 가면 그 화 시점으로 본다. 원고 목록으로 돌아가면 풀린다.
let view = null;
export function setViewAt(wid, cid) { view = cid ? { wid, cid } : null; }
export function viewAtFor(wid) {
  return view && view.wid === wid && db.chapters.has(view.cid) ? view.cid : null;
}

// ---- 연결: 항목 값 속 이름을 다른 설정 목록과 잇는다 ----
// 값은 자유 글이고, 연결된 목록의 이름이 나오면 알아본다 (본문 형광펜과 같은 방식).
// field.link = 목록 종류(type key) | null(연결 끔) | undefined(항목 이름으로 기본값)
const DEFAULT_LINK = {
  '현재 위치': 'place', '위치': 'place', '본거지': 'place',
  '소속': 'org',
  '가진 물건': 'item', '소지품': 'item',
  '소유자': 'character', '관련 인물': 'character', '우두머리': 'character', '구성원': 'character',
};
export const linkOf = (f) => (f.link !== undefined ? f.link : DEFAULT_LINK[f.label.trim()] || null);

export const namedOfType = (wid, type) =>
  [...db.entries.values()].filter((e) => e.workId === wid && e.type === type && e.name.trim());

// 값을 [{ t: 글, e: 알아본 설정 | null }] 조각으로
export function linkParts(text, targets) {
  const m = buildMatcher(targets);
  if (!m || !text) return [{ t: text, e: null }];
  const out = [];
  let last = 0;
  for (const x of text.matchAll(m.re)) {
    if (x.index > last) out.push({ t: text.slice(last, x.index), e: null });
    out.push({ t: x[0], e: m.map.get(x[0])[0] });
    last = x.index + x[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), e: null });
  return out;
}

// 이 설정을 가리키는 다른 설정 항목들 (시점 기준): [{ entry, field, value }]
export function mentionsOf(target, atCid = null) {
  const m = buildMatcher([target]);
  if (!m) return [];
  const order = orderOf(target.workId);
  const at = atCid ? order.get(atCid) ?? Infinity : Infinity;
  const out = [];
  for (const e of db.entries.values()) {
    if (e.workId !== target.workId || e === target) continue;
    for (const f of e.fields) {
      const link = linkOf(f);
      if (link && link !== target.type) continue;
      const v = valueAt(f, at, order).value;
      m.re.lastIndex = 0;
      if (v && m.re.test(v)) out.push({ entry: e, field: f, value: v });
    }
  }
  return out;
}

// ---- 시트: 값 고치기 / 화부터 바뀜 ----
// 글을 쓰다가 카드에서, 또는 설정 화면에서 부른다.
//   mode 'auto': 지금 화(cid) 시점에서 보이는 값을 고친다. 그 값이 앞 화에서 온 것이면
//                "이 화부터 바뀜"(기본)과 "원래 값 고치기" 중 고를 수 있다.
//   mode 'change': 몇 화부터 바뀌었는지 고르고 새 값을 적는다.
export function factSheet(e, f, { cid = null, mode = 'auto', title = null } = {}) {
  return new Promise((resolve) => {
    const chapters = chaptersOf(e.workId);
    const order = new Map(chapters.map((c, i) => [c.id, i]));
    if (!chapters.length) cid = null;
    if (mode === 'change' && !cid) cid = chapters[chapters.length - 1]?.id ?? null;
    let saved = false;

    const at = () => (cid ? order.get(cid) : Infinity);
    const input = autogrow(h('textarea', { class: 'field-input long', rows: 2, placeholder: '내용' }));
    input.value = valueAt(f, at(), order).value;

    // "이 화부터 바뀜" / "원래 값 고치기" 선택 (auto에서, 보이는 값이 이 화의 기록이 아닐 때만)
    let asChange = true;
    const src = valueAt(f, at(), order);
    // 첫 화에서는 '바뀜'과 '처음 값 고치기'가 같은 일이라 묻지 않는다
    const needChoice = mode === 'auto' && cid && order.get(cid) > 0 && src.rec?.chapterId !== cid;
    const chTitle = (id) => db.chapters.get(id)?.title || '';
    const seg = needChoice ? h('div', { class: 'seg' }) : null;
    const drawSeg = () => seg?.replaceChildren(
      h('button', { class: 'seg-btn' + (asChange ? ' on' : ''), type: 'button', onclick: () => { asChange = true; drawSeg(); } }, `${chTitle(cid)}부터 바뀜`),
      h('button', { class: 'seg-btn' + (!asChange ? ' on' : ''), type: 'button', onclick: () => { asChange = false; drawSeg(); } },
        src.rec ? `${chTitle(src.rec.chapterId)} 기록 고치기` : '처음 값 고치기'));
    drawSeg();

    // 'change': 몇 화부터인지 고르기
    const pick = mode === 'change' && chapters.length
      ? h('select', {
        class: 'field-input',
        onchange: () => { cid = pick.value; input.value = valueAt(f, at(), order).value; },
      }, chapters.map((c) => h('option', { value: c.id, selected: c.id === cid }, `${c.title}부터`)))
      : null;

    const form = h('form', {
      class: 'sheet-form',
      onsubmit: (ev) => {
        ev.preventDefault();
        const v = input.value.trim();
        let dropped = 0;
        if (mode === 'change' && order.get(cid) === 0 && !f.changes?.some((c) => c.chapterId === cid)) { f.value = v; dropped = pruneSame(f, order); put(recordStore(e), e); }
        else if (mode === 'change' || (needChoice && asChange)) {
          if (v !== valueAt(f, at(), order).value) { dropped = setChange(e, f, cid, v); emit('change-recorded'); }
        } else if (src.rec) { dropped = setChange(e, f, src.rec.chapterId, v); if (src.rec.chapterId === cid) emit('change-recorded'); }
        else { f.value = v; dropped = pruneSame(f, order); put(recordStore(e), e); }
        if (dropped) toast(`앞 화와 같은 값이 된 기록 ${dropped}개를 지웠어요.`);
        saved = true;
        s.close();
      },
    },
    pick, seg, input,
    needChoice ? h('p', { class: 'muted small' }, '‘바뀜’으로 적으면 앞 화들은 예전 값 그대로예요.') : null,
    h('button', { class: 'btn primary', type: 'submit' }, '저장'));

    const s = sheet(form, { title: title || `${e.name} · ${f.label || '설정'}`, onClose: () => resolve(saved) });
    setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 60);
  });
}
