// 따옴표 규칙. 스와이프와 내보내기가 같이 쓴다.
import { pref } from './prefs.js';

const PAIRS = [['“', '”'], ['"', '"'], ['‘', '’'], ["'", "'"]];
const STYLE = {
  curly: { double: ['“', '”'], single: ['‘', '’'] },
  straight: { double: ['"', '"'], single: ["'", "'"] },
};

function split(line) {
  const m = line.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return [m[1], m[2], m[3]];
}

// 'empty' | 'plain' | 'quoted' | 'mixed'(대사와 지문이 섞인 줄)
export function quoteState(line) {
  const b = line.trim();
  if (!b) return 'empty';
  for (const [o, c] of PAIRS) {
    if (b.length >= 2 && b.startsWith(o) && b.endsWith(c)) {
      const family = o === '“' || o === '"' ? /[“”"]/ : /[‘’']/;
      return family.test(b.slice(1, -1)) ? 'mixed' : 'quoted';
    }
  }
  return /[“”"‘’]/.test(b) ? 'mixed' : 'plain';
}

// dir: 1 = 큰따옴표, -1 = 작은따옴표. 이미 감싸져 있으면 푼다. 바꿀 수 없으면 null.
export function toggleQuote(line, dir, style = pref('quotes')) {
  const st = quoteState(line);
  if (st === 'empty' || st === 'mixed') return null;
  const [lead, body, trail] = split(line);
  if (st === 'quoted') return lead + body.slice(1, -1) + trail;
  const [o, c] = STYLE[style][dir > 0 ? 'double' : 'single'];
  return lead + o + body + c + trail;
}

// 내보낼 때 따옴표 모양을 하나로 통일한다.
// 곧은 따옴표 → 둥근 따옴표는 앞 글자를 보고 여는지 닫는지 정한다 (공백·줄 시작·여는 괄호 뒤면 여는 것).
export function normalizeQuotes(text, style = pref('quotes')) {
  if (style === 'straight') return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return text.replace(/["']/g, (q, i) => {
    const open = i === 0 || /[\s(\[{<“‘—–-]/.test(text[i - 1]);
    return q === '"' ? (open ? '“' : '”') : (open ? '‘' : '’');
  });
}
