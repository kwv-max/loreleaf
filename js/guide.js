// 튜토리얼. 설명을 읽히는 대신, 실제로 해보는 동작을 한 단계씩 따라가게 한다.
// 각 단계는 사용자가 그 동작을 하면(이벤트) 넘어간다. 현재 화면에 맞는 한 줄 안내만 보여준다.
//   basics: 처음 한 번 하는 1분 튜토리얼
//   그 밖: 도움말의 '해 보기' — 기능 하나씩, 샘플 작품에서 2~3단계
import { h } from './ui.js';
import { path, go } from './router.js';
import { db, chaptersOf } from './store.js';
import { insertSample } from './sample.js';

const KEY = 'll:guide';       // { tour, step } (예전 값: 숫자 = basics 단계)
const WORK = 'll:guide-work'; // basics에서 만든 작품
const DONE = 'll:tours-done'; // 끝까지 해 본 '해 보기'

// 연습용 샘플 작품 (없으면 새로 넣는다)
function sample() {
  return [...db.works.values()].find((w) => w.sample) || insertSample();
}
const sampleChapter = (i) => { const w = sample(); const list = chaptersOf(w.id); return { w, c: list[Math.min(i, list.length - 1)] }; };
const openSampleChapter = (i, label = '연습할 화 열기') => ({ label, run: () => { const { w, c } = sampleChapter(i); go(`/w/${w.id}/c/${c.id}`); } });
const inEditor = (p) => /\/c\//.test(p);

const BASICS = [
  {
    until: 'work-created',
    say: (p) => p === '/'
      ? '먼저 작품을 하나 만들어요. 아래 ‘새 작품’을 눌러 보세요.'
      : '작품 목록으로 돌아가 ‘새 작품’을 눌러요.',
  },
  {
    until: 'character-created',
    say: (p) => /^\/w\/[^/]+$/.test(p) ? '좋아요! 이번엔 등장인물이에요. 위의 ‘설정’ 탭을 눌러요.'
      : /\/lore$/.test(p) ? '‘캐릭터’를 눌러요.'
      : /\/lore\/character/.test(p) ? '오른쪽 위 ＋를 눌러 캐릭터를 추가해요.'
      : inEditor(p) ? '본문의 단어를 길게 눌러 선택하면, 바로 캐릭터로 등록할 수도 있어요.'
      : '작품의 ‘설정’ 탭에서 캐릭터를 하나 추가해요.',
  },
  {
    until: 'alias-added',
    say: (p) => /\/e\//.test(p)
      ? '이름을 적고, ‘별명’ 칸에 다른 호칭도 하나 넣어 보세요. (예: 마녀)'
      : '방금 만든 캐릭터를 열어 별명을 하나 붙여 봐요.',
  },
  {
    until: 'highlight-shown',
    say: (p) => inEditor(p) ? '이름이나 별명이 들어간 문장을 몇 개 써 보세요.'
      : '이제 글을 써 볼 차례예요.',
    // 에디터 밖이면 1화로 바로 가는 버튼을 준다. 메뉴를 찾아 헤매지 않도록.
    action: (p) => {
      if (inEditor(p)) return null;
      const w = db.works.get(localStorage.getItem(WORK));
      const c = w && chaptersOf(w.id)[0];
      return c ? { label: '1화 열기', run: () => go(`/w/${w.id}/c/${c.id}`) } : null;
    },
  },
  {
    until: 'card-opened',
    say: () => '형광펜 보이죠? 화면에만 보이고 원고엔 남지 않아요. 칠해진 이름을 탭해 보세요.',
  },
  {
    until: null,
    say: () => '끝이에요! 이게 갈피의 핵심이에요. 다른 기능은 도움말(?)의 ‘해 보기’에서 하나씩 해 볼 수 있어요.',
  },
];

// 기능별 '해 보기'. start: 시작할 때 갈 곳
export const TOURS = [
  {
    id: 'quotes', title: '대사 줄', desc: '한 줄을 옆으로 밀어 대사·생각으로 표시해요',
    start: () => openSampleChapter(0).run(),
    steps: [
      { until: 'quote-set', say: (p) => inEditor(p) ? '문장 한 줄을 손가락으로 오른쪽으로 밀어 보세요. 여백에 “ ”가 붙어요.' : '연습할 화를 열어요.', action: (p) => (inEditor(p) ? null : openSampleChapter(0)) },
      { until: 'quote-cleared', say: () => '따옴표는 원고 글자가 아니라 여백에 그려져요. 같은 줄을 한 번 더 밀면 풀려요.' },
      { until: null, say: () => '끝! 왼쪽으로 밀면 생각 ‘ ’예요. 키보드 위 막대의 버튼으로도 켜고 끌 수 있어요.' },
    ],
  },
  {
    id: 'notes', title: '주석', desc: '글에 나만 보는 메모를 달아요',
    start: () => openSampleChapter(0).run(),
    steps: [
      { until: 'note-added', say: (p) => inEditor(p) ? '문장의 일부를 길게 눌러 선택하고, 아래에 뜨는 ‘주석’을 눌러 적어 보세요.' : '연습할 화를 열어요.', action: (p) => (inEditor(p) ? null : openSampleChapter(0)) },
      { until: 'note-opened', say: () => '점선 밑줄이 생겼죠? 그 부분을 탭하면 주석이 보여요.' },
      { until: null, say: () => '끝! 주석은 내보낼 때 빠져요. ⋯ → ‘주석 모아 보기’에서 한눈에 볼 수 있어요.' },
    ],
  },
  {
    id: 'changes', title: '화마다 바뀌는 설정', desc: '이 화부터 바뀐 위치·상태를 기록해요',
    start: () => openSampleChapter(2).run(),
    steps: [
      { until: 'card-opened', say: (p) => inEditor(p) ? '칠해진 이름을 탭해 카드를 열어요.' : '연습할 화를 열어요.', action: (p) => (inEditor(p) ? null : openSampleChapter(2)) },
      { until: 'change-recorded', say: () => '카드의 설정 값을 하나 탭하고, ‘…부터 바뀜’을 고른 채 저장해 보세요.' },
      { until: null, say: () => '끝! 이 화에서 바뀐 항목에는 초록 점이 붙고, 앞 화들은 예전 값 그대로예요.' },
    ],
  },
  {
    id: 'relations', title: '관계', desc: '캐릭터끼리의 관계를 적고 그림으로 봐요',
    start: () => { const w = sample(); const e = [...db.entries.values()].find((x) => x.workId === w.id && x.type === 'character'); go(`/w/${w.id}/e/${e.id}`); },
    steps: [
      { until: 'relation-added', say: (p) => /\/e\//.test(p) ? '아래로 내려 ‘관계’의 ‘+ 관계 추가’를 누르고, 상대를 골라 한 줄 적어요.' : '캐릭터 설정을 열어요.' },
      { until: 'graph-opened', say: () => '관계 칸 오른쪽의 ‘관계도’를 눌러 그림으로 봐요.' },
      { until: null, say: () => '끝! 사람을 누르면 그 사람의 관계만 보이고, 끌어서 자리를 옮길 수 있어요.' },
    ],
  },
  {
    id: 'versions', title: '이전 버전', desc: '예전에 쓴 글로 되돌려요',
    start: () => openSampleChapter(0).run(),
    steps: [
      { until: 'text-edited', say: (p) => inEditor(p) ? '먼저 아무 글자나 조금 고쳐 보세요.' : '연습할 화를 열어요.', action: (p) => (inEditor(p) ? null : openSampleChapter(0)) },
      { until: 'versions-opened', say: () => '오른쪽 위 ⋯ → ‘이전 버전’을 눌러요.' },
      { until: 'version-restored', say: () => '고치기 전 글이 목록에 있어요. 눌러 보고 ‘이 버전으로 되돌리기’.' },
      { until: null, say: () => '끝! 되돌린 뒤에도 ↶ 로 다시 돌아올 수 있어요. 버전은 쓰는 동안 알아서 쌓여요.' },
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
    h('button', { class: 'guide-x', onclick: stopGuide }, last ? '닫기' : '그만'));
  top.append(bar);
}

export const decorate = refresh;
