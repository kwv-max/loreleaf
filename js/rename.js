// 이름 한 번에 바꾸기: 작품의 본문(모든 화)과 설정(항목 값·메모·관계)에서 한 낱말을 다른 낱말로.
// 바꾸기 전 모습은 화마다 '이전 버전'으로 남기고, 바로 되돌릴 수 있게 원래 값도 들고 있는다.
import { db, put, chaptersOf } from './store.js';
import { snapshot } from './versions.js';

// from이 나오는 자리. 새 이름이 옛 이름을 품고 있으면(유나 → 유나린) 이미 새 이름인 곳은 건너뛴다.
function allIndex(text, w, to = '') {
  const out = [];
  if (!w) return out;
  const k = to.indexOf(w);
  for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + w.length)) {
    if (k >= 0 && i - k >= 0 && text.startsWith(to, i - k)) continue;
    out.push(i);
  }
  return out;
}
const count = (text, w, to) => allIndex(text || '', w, to).length;

// ---- 조사 맞추기: 받침이 달라지면 이름 바로 뒤 조사도 바꾼다 (유나는 → 유나린은) ----
// 조사가 그 자체로 끝날 때만 (뒤가 띄어쓰기·문장부호·끝). '카이렌이었다' 같은 말은 건드리지 않는다.
const last = (w) => w.charCodeAt(w.length - 1) - 0xac00;
const isHangul = (w) => { const c = last(w); return c >= 0 && c <= 11171; };
const batchim = (w) => isHangul(w) && last(w) % 28 !== 0;
const rieul = (w) => isHangul(w) && last(w) % 28 === 8;
// [받침 있을 때, 없을 때]
const PAIRS = [['이랑', '랑'], ['이나', '나'], ['이여', '여'], ['으로', '로'], ['은', '는'], ['이', '가'], ['을', '를'], ['과', '와'], ['아', '야']];
const END = /^(?:[\s.,!?…~"'“”‘’「」『』()\[\]—-]|$)/;
// '이다'가 붙은 말: [받침 있을 때, 없을 때, 뒤가 끝나야 하는지] (카이렌이었다 → 카이였다)
const COPULA = [['이에요', '예요'], ['이었', '였'], ['이지만', '지만'], ['이라고', '라고'], ['이라는', '라는'], ['이라서', '라서'], ['이다', '다', true]];
function fixParticle(to, rest) {
  if (!isHangul(to)) return null;
  for (const [a, b, end] of COPULA) {
    for (const p of [a, b]) {
      if (!rest.startsWith(p) || (end && !END.test(rest.slice(p.length)))) continue;
      const want = batchim(to) ? a : b;
      return want === p ? null : { len: p.length, text: want };
    }
  }
  for (const [a, b] of PAIRS) {
    for (const p of [a, b]) {
      if (!rest.startsWith(p) || !END.test(rest.slice(p.length))) continue;
      const want = a === '으로' ? (batchim(to) && !rieul(to) ? a : b) : (batchim(to) ? a : b);
      return want === p ? null : { len: p.length, text: want };
    }
  }
  return null;
}

// 글 하나에서 바꾸기: 새 글과, 바뀐 자리들(주석 위치 옮기기용) [{ i, oldLen, newLen }]
function replaceText(text, from, to) {
  const idx = allIndex(text, from, to);
  const edits = [];
  for (const i of idx) {
    const fix = fixParticle(to, text.slice(i + from.length, i + from.length + 4));
    edits.push(fix
      ? { i, oldLen: from.length + fix.len, rep: to + fix.text }
      : { i, oldLen: from.length, rep: to });
  }
  let out = text;
  for (let k = edits.length - 1; k >= 0; k--) { // 뒤에서부터 바꾸면 앞쪽 위치가 안 흔들린다
    const e = edits[k];
    out = out.slice(0, e.i) + e.rep + out.slice(e.i + e.oldLen);
  }
  return { text: out, edits };
}

// 설정 쪽 글: [읽기, 쓰기, 레코드, 저장소] 목록
function settingTexts(wid) {
  const out = [];
  for (const e of db.entries.values()) {
    if (e.workId !== wid) continue;
    for (const f of e.fields) {
      out.push({ get: () => f.value, set: (v) => { f.value = v; }, rec: e, store: 'entries' });
      for (const c of f.changes || []) out.push({ get: () => c.value, set: (v) => { c.value = v; }, rec: e, store: 'entries' });
    }
    out.push({ get: () => e.note, set: (v) => { e.note = v; }, rec: e, store: 'entries' });
  }
  for (const r of db.relations.values()) {
    if (r.workId !== wid) continue;
    for (const side of [r.ab, r.ba]) {
      out.push({ get: () => side.value, set: (v) => { side.value = v; }, rec: r, store: 'relations' });
      for (const c of side.changes || []) out.push({ get: () => c.value, set: (v) => { c.value = v; }, rec: r, store: 'relations' });
    }
  }
  return out;
}

// 어디에 몇 번 나오는지 + 앞뒤가 보이는 예시 몇 개
export function mentions(wid, word, to = '') {
  const chapters = [];
  const samples = [];
  for (const c of chaptersOf(wid)) {
    const idx = allIndex(c.text, word, to);
    if (!idx.length) continue;
    chapters.push({ c, n: idx.length });
    for (const i of idx) {
      if (samples.length >= 4) break;
      const a = Math.max(0, i - 14), b = Math.min(c.text.length, i + word.length + 14);
      samples.push({
        before: (a > 0 ? '…' : '') + c.text.slice(a, i).replace(/\s+/g, ' '),
        hit: word,
        after: c.text.slice(i + word.length, b).replace(/\s+/g, ' ') + (b < c.text.length ? '…' : ''),
      });
    }
  }
  const settings = settingTexts(wid).reduce((n, t) => n + count(t.get(), word, to), 0);
  const inText = chapters.reduce((n, x) => n + x.n, 0);
  return { chapters, settings, inText, total: inText + settings, samples };
}

// 주석 위치는 바뀐 글자 수만큼 밀어 준다 (이름에는 줄바꿈이 없어서 대사 줄 표시는 그대로)
function replaceInChapter(c, from, to) {
  const { text, edits } = replaceText(c.text, from, to);
  if (!edits.length) return 0;
  const notes = (c.notes || []).map((n) => ({ ...n }));
  for (let k = edits.length - 1; k >= 0; k--) {
    const { i, oldLen, rep } = edits[k];
    const j = i + oldLen, delta = rep.length - oldLen;
    for (const n of notes) {
      if (n.start >= j) { n.start += delta; n.end += delta; }
      else if (n.end > i) n.end = Math.max(n.start, n.end + delta); // 주석 안에 든 이름
    }
  }
  c.text = text;
  c.notes = notes;
  put('chapters', c);
  return edits.length;
}

// 바꾸고, 되돌리는 함수를 돌려준다
export async function replaceEverywhere(wid, from, to) {
  const undo = [];
  let n = 0;
  for (const c of chaptersOf(wid)) {
    if (!count(c.text, from, to)) continue;
    await snapshot({ id: c.id, workId: wid, text: c.text, quotes: c.quotes, notes: c.notes }); // 바꾸기 전 모습
    const before = { text: c.text, notes: c.notes };
    n += replaceInChapter(c, from, to);
    undo.push(() => { c.text = before.text; c.notes = before.notes; put('chapters', c); });
  }
  const touched = new Map();
  for (const t of settingTexts(wid)) {
    const v = t.get();
    const k = count(v, from, to);
    if (!k) continue;
    t.set(replaceText(v, from, to).text);
    n += k;
    touched.set(t.rec, t.store);
    undo.push(() => t.set(v));
  }
  for (const [rec, store] of touched) put(store, rec);
  return {
    count: n,
    undo: () => {
      for (const u of undo.reverse()) u();
      for (const [rec, store] of touched) put(store, rec);
    },
  };
}

// 시험용
export const _replaceText = replaceText;
