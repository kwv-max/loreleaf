// 튜토리얼. 설명을 읽히는 대신, 실제로 해보는 동작을 한 단계씩 따라가게 한다.
// 각 단계는 사용자가 그 동작을 하면(이벤트) 넘어간다. 현재 화면에 맞는 한 줄 안내만 보여준다.
//   basics: 처음 한 번 하는 1분 튜토리얼
//   그 밖: 도움말의 '해 보기' — 기능 하나씩, 샘플 작품에서 2~3단계
import { h } from './ui.js';
import { path, go } from './router.js';
import { db, chaptersOf } from './store.js';
import { insertSample } from './sample.js';
import { t as tr } from './i18n.js';

const KEY = 'll:guide';       // { tour, step } (예전 값: 숫자 = basics 단계)
const WORK = 'll:guide-work'; // basics에서 만든 작품
const DONE = 'll:tours-done'; // 끝까지 해 본 '해 보기'

// 연습용 샘플 작품 (없으면 새로 넣는다)
function sample() {
  return [...db.works.values()].find((w) => w.sample) || insertSample();
}
const sampleChapter = (i) => { const w = sample(); const list = chaptersOf(w.id); return { w, c: list[Math.min(i, list.length - 1)] }; };
const openSampleChapter = (i, label = tr('guide.openPractice')) => ({ label, run: () => { const { w, c } = sampleChapter(i); go(`/w/${w.id}/c/${c.id}`); } });
const inEditor = (p) => /\/c\//.test(p);

const BASICS = [
  {
    until: 'work-created',
    say: (p) => p === '/'
      ? tr('guide.b1a')
      : tr('guide.b1b'),
  },
  {
    until: 'character-created',
    say: (p) => /^\/w\/[^/]+$/.test(p) ? tr('guide.b2a')
      : /\/lore$/.test(p) ? tr('guide.b2b')
      : /\/lore\/character/.test(p) ? tr('guide.b2c')
      : inEditor(p) ? tr('guide.b2d')
      : tr('guide.b2e'),
  },
  {
    until: 'alias-added',
    say: (p) => /\/e\//.test(p)
      ? tr('guide.b3a')
      : tr('guide.b3b'),
  },
  {
    until: 'highlight-shown',
    say: (p) => inEditor(p) ? tr('guide.b4a')
      : tr('guide.b4b'),
    // 에디터 밖이면 1화로 바로 가는 버튼을 준다. 메뉴를 찾아 헤매지 않도록.
    action: (p) => {
      if (inEditor(p)) return null;
      const w = db.works.get(localStorage.getItem(WORK));
      const c = w && chaptersOf(w.id)[0];
      return c ? { label: tr('guide.openFirst'), run: () => go(`/w/${w.id}/c/${c.id}`) } : null;
    },
  },
  {
    until: 'card-opened',
    say: () => tr('guide.b5'),
  },
  {
    until: null,
    say: () => tr('guide.b6'),
  },
];

// 기능별 '해 보기'. start: 시작할 때 갈 곳
export const TOURS = [
  {
    id: 'quotes', title: tr('tour.quotes'), desc: tr('tour.quotesDesc'),
    start: () => openSampleChapter(0).run(),
    steps: [
      { until: 'quote-set', say: (p) => inEditor(p) ? tr('tour.q1') : tr('tour.openIt'), action: (p) => (inEditor(p) ? null : openSampleChapter(0)) },
      { until: 'quote-cleared', say: () => tr('tour.q2') },
      { until: null, say: () => tr('tour.q3') },
    ],
  },
  {
    id: 'notes', title: tr('tour.notes'), desc: tr('tour.notesDesc'),
    start: () => openSampleChapter(0).run(),
    steps: [
      { until: 'note-added', say: (p) => inEditor(p) ? tr('tour.n1') : tr('tour.openIt'), action: (p) => (inEditor(p) ? null : openSampleChapter(0)) },
      { until: 'note-opened', say: () => tr('tour.n2') },
      { until: null, say: () => tr('tour.n3') },
    ],
  },
  {
    id: 'changes', title: tr('tour.changes'), desc: tr('tour.changesDesc'),
    start: () => openSampleChapter(2).run(),
    steps: [
      { until: 'card-opened', say: (p) => inEditor(p) ? tr('tour.c1') : tr('tour.openIt'), action: (p) => (inEditor(p) ? null : openSampleChapter(2)) },
      { until: 'change-recorded', say: () => tr('tour.c2') },
      { until: null, say: () => tr('tour.c3') },
    ],
  },
  {
    id: 'relations', title: tr('tour.rels'), desc: tr('tour.relsDesc'),
    start: () => { const w = sample(); const e = [...db.entries.values()].find((x) => x.workId === w.id && x.type === 'character'); go(`/w/${w.id}/e/${e.id}`); },
    steps: [
      { until: 'relation-added', say: (p) => /\/e\//.test(p) ? tr('tour.r1') : tr('tour.r1b') },
      { until: 'graph-opened', say: () => tr('tour.r2') },
      { until: null, say: () => tr('tour.r3') },
    ],
  },
  {
    id: 'versions', title: tr('tour.vers'), desc: tr('tour.versDesc'),
    start: () => openSampleChapter(0).run(),
    steps: [
      { until: 'text-edited', say: (p) => inEditor(p) ? tr('tour.v1') : tr('tour.openIt'), action: (p) => (inEditor(p) ? null : openSampleChapter(0)) },
      { until: 'versions-opened', say: () => tr('tour.v2') },
      { until: 'version-restored', say: () => tr('tour.v3') },
      { until: null, say: () => tr('tour.v4') },
    ],
  },
];
const tourOf = (id) => (id === 'basics' ? { id, steps: BASICS } : TOURS.find((t) => t.id === id));

function getState() {
  try {
    const v = localStorage.getItem(KEY);
    if (v == null) return null;
    if (/^\d+$/.test(v)) return { tour: 'basics', step: +v }; // 예전 저장 방식
    return JSON.parse(v);
  } catch { return null; }
}
const setState = (s) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {} };
export function toursDone() { try { return JSON.parse(localStorage.getItem(DONE) || '[]'); } catch { return []; } }
function markDone(id) { const d = new Set(toursDone()); d.add(id); try { localStorage.setItem(DONE, JSON.stringify([...d])); } catch {} }

export const guideActive = () => !!getState();
export function startGuide() { setState({ tour: 'basics', step: 0 }); }
export function startTour(id) {
  const t = tourOf(id);
  if (!t) return;
  setState({ tour: id, step: 0 });
  t.start?.();
  refresh();
}
export function stopGuide() { setState(null); refresh(); }

export function emit(evt, data) {
  const s = getState();
  if (!s) return;
  const t = tourOf(s.tour);
  if (!t || t.steps[s.step]?.until !== evt) return;
  if (evt === 'work-created') try { localStorage.setItem(WORK, data); } catch {}
  const next = s.step + 1;
  setState({ ...s, step: next });
  if (!t.steps[next].until) markDone(s.tour);
  refresh();
}

let bar = null;
function refresh() {
  const top = document.querySelector('#app .topbar');
  bar?.remove();
  bar = null;
  const s = getState();
  const t = s && tourOf(s.tour);
  if (!t || !top) return;
  const steps = t.steps;
  const i = Math.min(s.step, steps.length - 1);
  const last = i === steps.length - 1;
  const act = steps[i].action?.(path());
  bar = h('div', { class: 'guide' + (last ? ' done' : '') },
    h('span', { class: 'guide-step' }, last ? '✓' : `${i + 1}/${steps.length - 1}`),
    h('span', { class: 'guide-text' }, t.title ? h('b', null, t.title + ' · ') : null, steps[i].say(path())),
    act ? h('button', { class: 'guide-go', onclick: act.run }, act.label) : null,
    h('button', { class: 'guide-x', onclick: stopGuide }, last ? tr('common.close') : tr('guide.stop')));
  top.append(bar);
}

export const decorate = refresh;
