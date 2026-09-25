// 이 기기의 환경 설정. 작품 데이터가 아니라 쓰는 사람의 취향이라 localStorage에 둔다.
import { lang } from './i18n.js';

const KEY = 'll:prefs';
const DEFAULTS = { quotes: lang() === 'ja' ? 'corner' : 'curly', accent: 'forest', theme: 'system', edSize: 'm', edLine: 'normal', edFont: 'sans', goal: 0, serialGap: true, serialTitle: false }; // quotes: 'curly' = “ ” ‘ ’, 'straight' = " ' / theme: 'system' | 'light' | 'dark'

export function pref(name) {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }[name]; } catch { return DEFAULTS[name]; }
}

export function setPref(name, value) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    all[name] = value;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

// ---- 포인트 색 ----
// 밝은 화면과 어두운 화면에서 각각 잘 보이도록 색마다 두 벌. [이름, 밝을 때 색, 연한 배경, 어두울 때 색, 연한 배경, 어두울 때 글자]
export const ACCENTS = [
  ['forest', '숲', '#3f7d5c', '#e4efe8', '#7cc29a', '#1f3228', '#10231a'],
  ['teal', '청록', '#2a7f82', '#dff0ef', '#6cc8c6', '#1c3333', '#0c2222'],
  ['sea', '바다', '#3a6ea5', '#e3ecf6', '#7fb0e6', '#1d2a3a', '#0f1c2b'],
  ['violet', '보라', '#6a55a8', '#ebe7f6', '#ac9cef', '#2a2440', '#1a1330'],
  ['rose', '장미', '#b04a6a', '#f6e4ea', '#ec8fae', '#3a2129', '#2b0f18'],
  ['sunset', '노을', '#b8612a', '#f7e9de', '#f0a26b', '#3a2a1f', '#2b170a'],
  ['amber', '호박', '#97741c', '#f3ecd8', '#e0bf6a', '#3a321c', '#231b05'],
  ['ink', '먹', '#4a4a48', '#ecebe8', '#cfccc4', '#2c2c2a', '#161614'],
];
export const accentOf = (key) => ACCENTS.find((a) => a[0] === key) || ACCENTS[0];
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
export const isDark = () => (pref('theme') === 'system' ? systemDark() : pref('theme') === 'dark');

// ---- 화면 모드: 기본은 시스템 설정, 직접 고르면 그쪽 ----
export function applyTheme(mode = pref('theme')) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  // 상태 표시줄 색도 맞춘다
  const bg = isDark() ? '#161614' : '#f7f5f0';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (mode === 'system') m.content = m.media.includes('dark') ? '#161614' : '#f7f5f0';
    else m.content = bg;
  });
}

export function applyAccent(key = pref('accent')) {
  const [, , l, ls, d, ds, di] = accentOf(key);
  let el = document.getElementById('accent-style');
  if (!el) { el = document.createElement('style'); el.id = 'accent-style'; document.head.append(el); }
  const dark = `{--accent:${d};--accent-soft:${ds};--accent-ink:${di}}`;
  el.textContent = `:root{--accent:${l};--accent-soft:${ls};--accent-ink:#fff}`
    + `@media (prefers-color-scheme: dark){:root:not([data-theme="light"])${dark}}`
    + `:root[data-theme="dark"]${dark}`;
}
applyTheme();
applyAccent();

// ---- 에디터 글자: 크기·줄 간격·글꼴 ----
// 에디터는 글 칸 위에 형광펜·찾기·주석 층이 겹쳐 있어서, 모두 같은 값을 써야 줄이 어긋나지 않는다 (CSS 변수 하나로).
export const TEXT_SIZES = { s: 15, m: 17, l: 19, xl: 21 };
export const TEXT_LINES = { normal: 1.85, wide: 2.15 };
export const TEXT_FONTS = {
  sans: 'var(--font)',
  // 일본어 화면은 일본어 명조를 먼저 (같은 한자라도 한국어 글꼴은 모양이 달라서)
  serif: lang() === 'ja'
    ? '"Noto Serif JP", "Noto Serif CJK JP", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif KR", serif'
    : '"Noto Serif KR", "Noto Serif CJK KR", "Source Han Serif K", "Nanum Myeongjo", "AppleMyungjo", "Batang", serif',
};
export function applyText() {
  const r = document.documentElement.style;
  r.setProperty('--ed-size', (TEXT_SIZES[pref('edSize')] || 17) + 'px');
  r.setProperty('--ed-lh', String(TEXT_LINES[pref('edLine')] || 1.85));
  r.setProperty('--ed-font', TEXT_FONTS[pref('edFont')] || TEXT_FONTS.sans);
  // 명조: 휴대폰에 한글 명조가 없는 경우가 많아서, 고른 사람만 웹 글꼴을 받아 온다 (한 번 받으면 브라우저가 기억)
  if (pref('edFont') === 'serif' && !document.getElementById('serif-font')) {
    document.head.append(Object.assign(document.createElement('link'), {
      id: 'serif-font', rel: 'stylesheet',
      href: `https://fonts.googleapis.com/css2?family=${lang() === 'ja' ? 'Noto+Serif+JP' : 'Noto+Serif+KR'}:wght@400;700&display=swap`,
    }));
  }
}
applyText();
