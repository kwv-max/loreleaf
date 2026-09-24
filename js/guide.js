// 첫 실행 튜토리얼. 설명을 읽히는 대신, 실제로 해보는 동작을 한 단계씩 따라가게 한다.
// 각 단계는 사용자가 그 동작을 하면(이벤트) 넘어간다. 현재 화면에 맞는 한 줄 안내만 보여준다.
import { h } from './ui.js';
import { path, go } from './router.js';
import { db, chaptersOf } from './store.js';

const KEY = 'll:guide';
const WORK = 'll:guide-work';
const STEPS = [
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
      : /\/c\//.test(p) ? '본문의 단어를 길게 눌러 선택하면, 바로 캐릭터로 등록할 수도 있어요.'
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
    say: (p) => /\/c\//.test(p) ? '이름이나 별명이 들어간 문장을 몇 개 써 보세요.'
      : '이제 글을 써 볼 차례예요.',
    // 에디터 밖이면 1화로 바로 가는 버튼을 준다. 메뉴를 찾아 헤매지 않도록.
    action: (p) => {
      if (/\/c\//.test(p)) return null;
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
    say: () => '끝이에요! 이게 갈피의 핵심이에요. 더 궁금한 건 첫 화면의 ? 도움말에 있어요.',
  },
];

const getStep = () => { try { const v = localStorage.getItem(KEY); return v == null ? -1 : +v; } catch { return -1; } };
const setStep = (i) => { try { i < 0 ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, String(i)); } catch {} };

export const guideActive = () => getStep() >= 0;
export function startGuide() { setStep(0); }
export function stopGuide() { setStep(-1); refresh(); }

export function emit(evt, data) {
  const i = getStep();
  if (i < 0 || STEPS[i].until !== evt) return;
  if (evt === 'work-created') try { localStorage.setItem(WORK, data); } catch {}
  setStep(i + 1);
  refresh();
}

let bar = null;
function refresh() {
  const top = document.querySelector('#app .topbar');
  bar?.remove();
  bar = null;
  const i = getStep();
  if (i < 0 || !top) return;
  const last = i === STEPS.length - 1;
  const act = STEPS[i].action?.(path());
  bar = h('div', { class: 'guide' + (last ? ' done' : '') },
    h('span', { class: 'guide-step' }, last ? '✓' : `${i + 1}/${STEPS.length - 1}`),
    h('span', { class: 'guide-text' }, STEPS[i].say(path())),
    act ? h('button', { class: 'guide-go', onclick: act.run }, act.label) : null,
    h('button', { class: 'guide-x', onclick: stopGuide }, last ? '닫기' : '그만'));
  top.append(bar);
}

export const decorate = refresh;
