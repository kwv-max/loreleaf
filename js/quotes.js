// 대사 줄. 따옴표는 원고 글자가 아니라 "이 줄은 대사"라는 표시로 따로 저장한다.
//   chapter.quotes = { 줄번호: 'd'(큰따옴표·대사) | 's'(작은따옴표·생각) }
// 에디터에서는 여백에 그려지고, 내보내기·복사할 때만 진짜 따옴표 글자가 붙는다.
import { pref } from './prefs.js';
import { diffRange } from './anchors.js';

const PAIRS = [['“', '”'], ['"', '"'], ['‘', '’'], ["'", "'"], ['「', '」'], ['『', '』']];
const STYLE = {
  curly: { d: ['“', '”'], s: ['‘', '’'] },
  straight: { d: ['"', '"'], s: ["'", "'"] },
  corner: { d: ['「', '」'], s: ['『', '』'] }, // 일본어·중국어 원고식 낫표
};
export const quoteChars = (flag, style = pref('quotes')) => (STYLE[style] || STYLE.curly)[flag];

function split(line) {
  const m = line.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return [m[1], m[2], m[3]];
}

// 글자로 된 따옴표의 상태: 'empty' | 'plain' | 'quoted' | 'mixed'(대사와 지문이 섞인 줄)
export function quoteState(line) {
  const b = line.trim();
  if (!b) return 'empty';
  for (const [o, c] of PAIRS) {
    if (b.length >= 2 && b.startsWith(o) && b.endsWith(c)) {
      const family = { '“': /[“”"]/, '"': /[“”"]/, '‘': /[‘’']/, "'": /[‘’']/, '「': /[「」]/, '『': /[『』]/ }[o];
      return family.test(b.slice(1, -1)) ? 'mixed' : 'quoted';
    }
  }
  return /[“”"‘’「」『』]/.test(b) ? 'mixed' : 'plain';
}

// 글자 따옴표로 감싼 줄 → [따옴표 뗀 줄, 'd'|'s']
export function unquote(line) {
  const [lead, body, trail] = split(line);
  return [lead + body.slice(1, -1) + trail, /^[“"「]/.test(body) ? 'd' : 's'];
}

export function wrapLine(line, flag, style = pref('quotes')) {
  if (!flag || !line.trim()) return line;
  const [lead, body, trail] = split(line);
  const [o, c] = quoteChars(flag, style);
  return lead + o + body + c + trail;
}

// ---- 줄 표시 배열 ----
export function flagsOf(ch) {
  const a = new Array(ch.text.split('\n').length).fill(0);
  for (const [k, v] of Object.entries(ch.quotes || {})) if (+k < a.length) a[+k] = v;
  return a;
}
export function packFlags(a) {
  const o = {};
  a.forEach((v, i) => { if (v) o[i] = v; });
  return o;
}

// 텍스트가 바뀌면 줄 표시가 원래 줄을 따라가게 옮긴다.
// 바뀐 구간(공통 앞/뒤를 뺀 부분)을 찾아, 그 앞 줄은 그대로, 뒤 줄은 줄 수 차이만큼 민다.
// 바뀐 줄 자체는: 앞부분이 남아 있으면 원래 줄의 표시를, 뒷부분이 남아 있으면 그 줄의 표시를 이어받는다.
//  - 대사 줄 끝에서 엔터 → 새 줄은 일반 줄
//  - 대사 줄 맨 앞에서 엔터 → 대사 표시가 내용과 함께 아래로
export function remapFlags(flags, O, N, caret = N.length) {
  if (O === N) return flags;
  const d = diffRange(O, N, caret);
  const p = d.p, s = N.length - d.nEnd;

  const nl = (str) => { let n = 0; for (const ch of str) if (ch === '\n') n++; return n; };
  const L = nl(O.slice(0, p));
  const removed = nl(O.slice(p, O.length - s));
  const inserted = nl(N.slice(p, N.length - s));
  const prefix = N.slice(N.lastIndexOf('\n', p - 1) + 1, p);
  const tailStart = N.length - s;
  const tailEnd = N.indexOf('\n', tailStart);
  const tail = N.slice(tailStart, tailEnd < 0 ? N.length : tailEnd);
  const first = flags[L] || 0, last = flags[L + removed] || 0;

  const mid = inserted === 0
    ? [prefix ? first : last]
    : [prefix ? first : 0, ...new Array(inserted - 1).fill(0), tail ? last : 0];
  return [...flags.slice(0, L), ...mid, ...flags.slice(L + removed + 1)];
}

// ---- 내보내기 ----
// 곧은 따옴표 → 둥근 따옴표는 앞 글자를 보고 여는지 닫는지 정한다 (공백·줄 시작·여는 괄호 뒤면 여는 것).
export function normalizeQuotes(text, style = pref('quotes')) {
  if (style === 'straight') return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (style === 'corner') return text; // 줄 안의 따옴표는 작가가 쓴 그대로
  return text.replace(/["']/g, (q, i) => {
    const open = i === 0 || /[\s(\[{<“‘—–-]/.test(text[i - 1]);
    return q === '"' ? (open ? '“' : '”') : (open ? '‘' : '’');
  });
}

// 원고 그대로의 텍스트 (대사 줄에 따옴표를 붙이고, 글자 따옴표 모양도 통일)
export function manuscriptText(ch, style = pref('quotes')) {
  const flags = flagsOf(ch);
  return normalizeQuotes(ch.text, style).split('\n').map((l, i) => wrapLine(l, flags[i], style)).join('\n');
}

// 글자 수 (내보낸 원고 기준: 대사 줄마다 따옴표 2자)
export function lengthOf(ch) {
  const lines = ch.text.split('\n');
  let n = ch.text.length;
  for (const [k] of Object.entries(ch.quotes || {})) if (lines[+k]?.trim()) n += 2;
  return n;
}

// 예전 방식(따옴표를 글자로 쓴 줄)을 대사 줄 표시로 한 번만 옮긴다.
// 대사와 지문이 섞인 줄은 글자 그대로 둔다.
export function migrateChapter(ch) {
  if (ch.quotes) return false;
  const flags = [];
  ch.text = ch.text.split('\n').map((l, i) => {
    if (quoteState(l) !== 'quoted') return l;
    const [t, f] = unquote(l);
    flags[i] = f;
    return t;
  }).join('\n');
  ch.quotes = packFlags(flags);
  return true;
}
