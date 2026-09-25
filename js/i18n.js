// 화면 글의 언어. 기본은 휴대폰 언어(한국어·일본어가 아니면 영어), 환경 설정에서 바꿀 수 있다.
// 문구는 lang/*.js 에 키로 모아 둔다. 값은 글이거나, 문법이 언어마다 달라지는 경우 함수(vars) => 글.
//   t('prefs.title')                  → '환경 설정'
//   t('work.deleted', { name })       → '‘검은 여우’를 지웠어요.' (한국어는 조사까지)
// 그 언어에 없는 키는 한국어로, 그것도 없으면 키 그대로 보인다(빠진 곳을 찾기 쉽게).
import ko from './lang/ko.js';
import en from './lang/en.js';
import ja from './lang/ja.js';
import helpKo from './lang/help.ko.js';
import helpEn from './lang/help.en.js';
import helpJa from './lang/help.ja.js';

const DICT = { ko, en, ja };
export const LANGS = [['ko', '한국어'], ['en', 'English'], ['ja', '日本語']];

// 환경 설정은 prefs.js를 거치면 서로 불러오는 고리가 생겨서, 여기서 바로 읽는다
function chosen() {
  try { return JSON.parse(localStorage.getItem('ll:prefs') || '{}').lang || 'system'; } catch { return 'system'; }
}
export function systemLang() {
  const n = (navigator.language || 'ko').slice(0, 2).toLowerCase();
  return n === 'ko' || n === 'ja' ? n : 'en';
}
const current = (() => { const c = chosen(); return DICT[c] ? c : systemLang(); })();
export const lang = () => current;

export function t(key, vars = {}) {
  const v = DICT[current][key] ?? DICT.ko[key];
  if (v == null) return key;
  if (typeof v === 'function') return v(vars);
  return v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

document.documentElement.lang = current;
document.title = t('app.name');

// ---- 화 제목의 번호 ('3화' / 'Chapter 3' / '第3話') ----
export const chapterTitle = (n) => t('unit.chapterTitle', { n });
const CH_NUM = /^(\d+)\s*화|^chapter\s*(\d+)|^第\s*(\d+)\s*話/i;
export function chapterNumOf(title) {
  const m = String(title).match(CH_NUM);
  return m ? +(m[1] || m[2] || m[3]) : null;
}
// 번호만 바꾸고 모양은 그대로 (3화 → 2화, Chapter 3 → Chapter 2)
export const renumberTitle = (title, n) => String(title).replace(CH_NUM, (m) => m.replace(/\d+/, n));

// 도움말 항목 [{ id, title, lines }]
const HELP = { ko: helpKo, en: helpEn, ja: helpJa };
export const helpTopics = () => HELP[current] || helpKo;
