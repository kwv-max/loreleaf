// 작품 화면. 탭은 딱 두 개: 원고(화 목록)와 설정(설정 자료).
import { h, icon, iconBtn, topbar, num, relTime, ask, actions, toast, josa, pickIcon, confirmBox } from '../ui.js';
import { db, chaptersOf, createChapter, put, del, typesOf, entriesOf, createType } from '../store.js';
import { go, back } from '../router.js';
import { workMenu, exportChapter, serialCopy } from './library.js';
import { countOf } from '../quotes.js';
import { setViewAt } from '../timeline.js';
import { atBanner } from './lore.js';
import { t, chapterNumOf, renumberTitle } from '../i18n.js';

function tabs(wid, active) {
  const tab = (key, label, to) => h('button', {
    class: 'tab' + (active === key ? ' on' : ''),
    'aria-selected': active === key,
    onclick: () => active !== key && go(to, { replace: true }),
  }, label);
  return h('div', { class: 'tabs', role: 'tablist' },
    tab('ms', t('work.tabMs'), '/w/' + wid),
    tab('lore', t('work.tabLore'), `/w/${wid}/lore`));
}

function shell(w, active, body, bottom) {
  return h('div', { class: 'screen' },
    topbar({
      onBack: () => back('/'),
      title: w.title,
      right: [
        iconBtn('search', t('work.search'), () => go(`/w/${w.id}/search`)),
        iconBtn('more', t('lib.workMenu'), () => workMenu(w, { onDeleted: () => go('/', { replace: true }) })),
      ],
    }),
    tabs(w.id, active),
    h('main', { class: 'content' }, body),
    bottom);
}

// 화가 많아지면: 부로 묶고(접기), 번호나 제목으로 찾고, 끌어서 순서를 바꾼다.
//   chapter.part = '2부 · 봄'  → 이 화부터 새 부가 시작된다 (화를 옮기면 부 시작도 같이 옮겨 간다)
let reorderWid = null;   // 순서 바꾸기 중인 작품
const filterQ = new Map(); // 작품 → 화 찾기 글
const folded = (cid) => { try { return localStorage.getItem('ll:fold:' + cid) === '1'; } catch { return false; } };
const setFolded = (cid, v) => { try { v ? localStorage.setItem('ll:fold:' + cid, '1') : localStorage.removeItem('ll:fold:' + cid); } catch {} };
const refresh = () => go(location.hash.slice(1), { replace: true });

export function manuscriptScreen({ wid }) {
  const w = db.works.get(wid);
  if (!w) { go('/', { replace: true }); return null; }
  setViewAt(null); // 원고 목록으로 돌아오면 '어느 화 시점' 보기는 끝
  const list = chaptersOf(wid);
  const reorder = reorderWid === wid;
  const q = (filterQ.get(wid) || '').trim();

  const chapterRow = (c, i) => {
    const text = c.text.trim();
    return h('div', { class: 'row' + (c.id === w.lastChapterId ? ' current' : ''), 'data-id': c.id },
      h('button', { class: 'row-main', onclick: () => !reorder && go(`/w/${wid}/c/${c.id}`) },
        h('div', { class: 'row-title' }, c.title),
        h('div', { class: 'row-sub' }, text ? `${t('unit.chars', { n: num(countOf(c)) })} · ${relTime(c.updatedAt)}` : t('work.empty')),
        text && !reorder ? h('div', { class: 'row-snippet' }, text.slice(0, 70).replace(/\s+/g, ' ')) : null),
      reorder
        ? h('span', { class: 'grip', 'aria-label': t('work.drag') }, icon('grip'))
        : iconBtn('more', t('work.chapterMenu'), () => chapterMenu(c, i, list)));
  };
  // 부 제목 줄: 누르면 접고 펴기
  const partHead = (c, i) => {
    let n = 0, len = 0;
    for (let k = i; k < list.length && (k === i || !list[k].part); k++) { n++; len += countOf(list[k]); }
    const f = folded(c.id) && !reorder;
    return h('div', { class: 'part-head' + (f ? ' folded' : '') },
      h('button', { class: 'part-main', onclick: () => { if (!reorder) { setFolded(c.id, !f); refresh(); } } },
        icon(f ? 'chev' : 'down', 'part-ic'),
        h('b', null, c.part),
        h('span', { class: 'muted small' }, `${t('unit.chapters', { n })} · ${t('unit.chars', { n: num(len) })}`)),
      reorder ? null : iconBtn('more', t('work.partMenu'), () => partMenu(c)));
  };

  let body;
  if (q) {
    // 화 찾기: 번호(12, 12화)나 제목 글자
    const numQ = /^\d+\s*(화|話)?$/.test(q) ? parseInt(q, 10) : null;
    const hits = list.map((c, i) => [c, i]).filter(([c, i]) => (numQ != null
      ? i + 1 === numQ || chapterNumOf(c.title) === numQ
      : c.title.toLowerCase().includes(q.toLowerCase())));
    body = hits.length ? h('div', { class: 'list' }, hits.map(([c, i]) => chapterRow(c, i))) : h('p', { class: 'muted center pad' }, t('work.noMatch'));
  } else {
    const kids = [];
    let group = null, hide = false;
    list.forEach((c, i) => {
      if (c.part) { group = null; hide = folded(c.id) && !reorder; kids.push(partHead(c, i)); }
      if (hide) return;
      if (!group) { group = h('div', { class: 'list' }); kids.push(group); }
      group.append(chapterRow(c, i));
    });
    body = h('div', { class: 'chapters' + (reorder ? ' reordering' : '') }, kids);
    if (reorder) enableDrag(body, list);
  }

  // 위쪽 도구: 화가 많을 때만 찾기 칸, 두 화 이상이면 순서 바꾸기
  const find = list.length >= 12 && !reorder ? h('input', {
    class: 'chapter-find', type: 'search', placeholder: t('work.findPh'), value: q, enterkeyhint: 'search', 'aria-label': t('work.find'),
    oninput: (ev) => {
      filterQ.set(wid, ev.target.value);
      const at = ev.target.selectionStart;
      refresh();
      const again = document.querySelector('.chapter-find');
      if (again) { again.focus(); again.setSelectionRange(at, at); }
    },
  }) : null;
  const tools = list.length >= 2 ? h('div', { class: 'ms-tools' },
    find || h('span', { class: 'muted small' }, reorder ? t('work.dragHint') : ''),
    reorder ? null : h('button', { class: 'link-btn small', onclick: () => { reorderWid = wid; filterQ.delete(wid); refresh(); } }, t('work.reorder'))) : null;

  if (list.length >= 12 && !q && !reorder) {
    // 이어 쓰던 화가 보이게
    setTimeout(() => document.querySelector('.chapters .row.current')?.scrollIntoView({ block: 'center' }), 0);
  }

  // 샘플은 AI로 만든 예시 글이라는 걸 밝혀 둔다
  const sampleNote = w.sample ? h('p', { class: 'muted small sample-note' }, t('work.sampleNote')) : null;
  return shell(w, 'ms', [sampleNote, tools, body],
    h('div', { class: 'bottom-bar' }, reorder
      ? h('button', { class: 'btn primary', onclick: () => finishReorder(wid) }, t('work.done'))
      : h('button', {
        class: 'btn primary',
        onclick: () => { const c = createChapter(wid); go(`/w/${wid}/c/${c.id}`); },
      }, icon('plus'), t('work.newChapter'))));
}

// 손잡이를 끌어 옮기기. 놓으면 화면 순서대로 order를 다시 매긴다.
function enableDrag(root, list) {
  let d = null;
  root.addEventListener('pointerdown', (ev) => {
    const grip = ev.target.closest('.grip');
    if (!grip) return;
    ev.preventDefault();
    const row = grip.closest('.row');
    const r = row.getBoundingClientRect();
    const ph = h('div', { class: 'row placeholder', style: `height:${r.height}px` });
    row.before(ph);
    row.classList.add('dragging');
    Object.assign(row.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', zIndex: 20 });
    d = { row, ph, dy: ev.clientY - r.top, id: ev.pointerId };
    grip.setPointerCapture(ev.pointerId);
  });
  root.addEventListener('pointermove', (ev) => {
    if (!d || ev.pointerId !== d.id) return;
    d.row.style.top = ev.clientY - d.dy + 'px';
    // 손가락 아래에 있는 줄의 위/아래 반쪽을 보고 자리 표시를 옮긴다
    const rows = [...root.querySelectorAll('.row:not(.dragging):not(.placeholder)')];
    for (const o of rows) {
      const rr = o.getBoundingClientRect();
      if (ev.clientY < rr.top || ev.clientY > rr.bottom) continue;
      if (ev.clientY < rr.top + rr.height / 2) o.before(d.ph); else o.after(d.ph);
      break;
    }
    // 화면 끝에 가까우면 스크롤
    if (ev.clientY < 90) window.scrollBy(0, -8);
    else if (ev.clientY > innerHeight - 110) window.scrollBy(0, 8);
  });
  const end = (ev) => {
    if (!d || ev.pointerId !== d.id) return;
    d.ph.replaceWith(d.row);
    d.row.classList.remove('dragging');
    d.row.removeAttribute('style');
    d = null;
    // 화면에 놓인 순서대로 번호 매기기
    const ids = [...root.querySelectorAll('.row[data-id]')].map((x) => x.dataset.id);
    ids.forEach((id, i) => {
      const c = db.chapters.get(id);
      if (c && c.order !== i + 1) { c.order = i + 1; put('chapters', c, { touch: false }); }
    });
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}

// 순서 바꾸기를 마칠 때: 제목이 'n화'로 시작하면 번호를 새 순서에 맞출지 묻는다
async function finishReorder(wid) {
  reorderWid = null;
  const list = chaptersOf(wid);
  const off = list.map((c, i) => [c, i + 1]).filter(([c, n]) => { const m = chapterNumOf(c.title); return m != null && m !== n; });
  refresh();
  if (!off.length) return;
  const sample = off.slice(0, 2).map(([c, n]) => `${c.title} → ${renumberTitle(c.title, n)}`).join(', ') + (off.length > 2 ? ' …' : '');
  if (await confirmBox(t('work.renumberAsk', { sample }), { ok: t('work.renumber') })) {
    for (const [c, n] of off) { c.title = renumberTitle(c.title, n); put('chapters', c, { touch: false }); }
    refresh();
    toast(t('work.renumbered', { n: off.length }));
  }
}

function partMenu(c) {
  actions([
    { label: t('work.partRename'), run: async () => {
      const name = await ask(t('work.partName'), { value: c.part });
      if (name) { c.part = name; put('chapters', c, { touch: false }); refresh(); }
    } },
    { label: t('work.partUngroup'), run: () => { delete c.part; setFolded(c.id, false); put('chapters', c, { touch: false }); refresh(); } },
  ], c.part);
}

function chapterMenu(c, i, list) {
  actions([
    { label: t('lib.renameTitle'), run: async () => {
      const title = await ask(t('work.chapterTitle'), { value: c.title });
      if (title) { c.title = title; put('chapters', c); refresh(); }
    } },
    { label: t('work.serialCopy'), run: () => serialCopy(c) },
    { label: t('work.exportChapter'), run: () => exportChapter(db.works.get(c.workId), c) },
    c.part ? null : { label: t('work.newPart'), run: async () => {
      const n = list.slice(0, i + 1).filter((x) => x.part).length + (list[0].part ? 1 : 2);
      const name = await ask(t('work.newPartName'), { value: t('unit.part', { n }), placeholder: t('work.newPartPh') });
      if (name) { c.part = name; put('chapters', c, { touch: false }); refresh(); }
    } },
    { label: t('common.delete'), danger: true, run: () => {
      del('chapters', c.id);
      refresh();
      toast(t('work.chapterDeleted', { title: c.title }), {
        action: t('common.undo'), duration: 6000,
        onAction: () => { put('chapters', c, { touch: false }); refresh(); },
      });
    } },
  ], c.title);
}

export function loreScreen({ wid }) {
  const w = db.works.get(wid);
  if (!w) { go('/', { replace: true }); return null; }
  const rows = h('div', { class: 'list' }, typesOf(wid).map((ty) => {
    const items = entriesOf(wid, ty.key).filter((e) => e.name.trim());
    const preview = items.slice(0, 3).map((e) => e.name).join(', ') + (items.length > 3 ? t('work.more', { n: items.length - 3 }) : '');
    return h('div', { class: 'row' },
      h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/lore/${ty.key}`) },
        icon(ty.icon, 'type-ic'),
        h('div', null,
          h('div', { class: 'row-title' }, ty.label, items.length ? h('span', { class: 'count' }, items.length) : null),
          preview ? h('div', { class: 'row-sub' }, preview) : null)),
      icon('chev', 'chev'));
  }));
  // 분류가 모자라면 직접 만든다 (예: 종족, 마법, 사건)
  const addType = async () => {
    const label = await ask(t('work.newType'), { placeholder: t('work.newTypePh'), ok: t('work.next') });
    if (!label) return;
    const ic = await pickIcon(null, { title: t('work.typeIconTitle', { label }), defaultLabel: t('work.later') });
    const ty = createType(wid, label, ic || 'note');
    toast(t('work.typeCreated', { label }));
    go(`/w/${wid}/lore/${ty.key}`);
  };
  const nRel = [...db.relations.values()].filter((r) => r.workId === wid).length;
  const graphRow = nRel ? h('div', { class: 'list graph-entry' }, h('div', { class: 'row' },
    h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/graph`) },
      icon('people', 'type-ic'),
      h('div', null, h('div', { class: 'row-title' }, t('work.graph'), h('span', { class: 'count' }, nRel)), h('div', { class: 'row-sub' }, t('work.graphSub')))),
    icon('chev', 'chev'))) : null;
  return shell(w, 'lore', [atBanner(wid), graphRow, rows,
    h('button', { class: 'add-type', onclick: addType }, icon('plus'), t('work.addType'))]);
}
