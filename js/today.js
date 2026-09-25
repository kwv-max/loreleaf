// 오늘 쓴 글자 수 (영어 화면은 단어 수). 화마다 '오늘 처음 손댈 때의 글자 수'를 기준으로 늘어난 만큼만 센다 (줄었으면 0).
// 고치거나 지운 건 빼지 않고, 새로 쓴 양을 보여 주는 게 목적. 이 기기에만 (localStorage).
import { countOf } from './quotes.js';
import { lang } from './i18n.js';

const KEY = 'll:today';
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  const unit = lang() === 'en' ? 'w' : 'c'; // 언어를 바꾸면 세는 단위가 달라지니 새로
  return s && s.date === dayKey() && (s.unit || 'c') === unit ? s : { date: dayKey(), unit, base: {}, len: {}, work: {} };
}
function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

// 화를 열 때: 오늘 처음이면 지금 글자 수를 기준으로
export function noteOpen(ch) {
  const s = load();
  if (!(ch.id in s.base)) { const n = countOf(ch); s.base[ch.id] = n; s.len[ch.id] = n; s.work[ch.id] = ch.workId; store(s); }
}
// 저장할 때: 지금 글자 수 (자정을 넘겨 쓰는 중이면 그때부터 센다)
export function noteSave(ch) {
  const s = load();
  const n = countOf(ch);
  if (!(ch.id in s.base)) s.base[ch.id] = n;
  s.len[ch.id] = n;
  s.work[ch.id] = ch.workId;
  store(s);
}
// 오늘 쓴 글자 수 (작품을 주면 그 작품만)
export function todayCount(wid = null) {
  const s = load();
  let n = 0;
  for (const id of Object.keys(s.base)) {
    if (wid && s.work[id] !== wid) continue;
    n += Math.max(0, (s.len[id] ?? s.base[id]) - s.base[id]);
  }
  return n;
}
