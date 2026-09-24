// 본문 속 캐릭터 이름·별명 찾기. 원고 텍스트는 건드리지 않고, 편집기 뒤에 깔리는 표시용 HTML만 만든다.
import { esc } from './ui.js';
import { chaptersOf } from './store.js';

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termsOf(c) {
  return [c.name, ...(c.aliases || [])].map((t) => (t || '').trim()).filter(Boolean);
}

export function buildMatcher(chars) {
  const map = new Map();
  for (const c of chars) for (const t of termsOf(c)) if (!map.has(t)) map.set(t, c);
  if (!map.size) return null;
  // 긴 이름부터 맞춰야 '검은 여우'가 '여우'보다 먼저 잡힌다.
  const terms = [...map.keys()].sort((a, b) => b.length - a.length);
  return { re: new RegExp(terms.map(escRe).join('|'), 'g'), map };
}

function paragraphHTML(text, m, base) {
  if (!m) return esc(text);
  let out = '';
  let last = 0;
  for (const x of text.matchAll(m.re)) {
    const c = m.map.get(x[0]);
    out += esc(text.slice(last, x.index)) +
      `<mark data-id="${c.id}" data-i="${base + x.index}" style="--c:${c.color}">${esc(x[0])}</mark>`;
    last = x.index + x[0].length;
  }
  return out + esc(text.slice(last));
}

// 문단마다 <span data-s="시작 위치">로 감싼다 (줄 스와이프가 어느 문단인지 찾을 때 쓴다).
// 인라인 요소라 줄바꿈·배치는 textarea와 똑같이 유지된다.
export function highlightHTML(text, m) {
  let pos = 0;
  const parts = text.split('\n').map((p) => {
    const html = `<span data-s="${pos}">${paragraphHTML(p, m, pos)}</span>`;
    pos += p.length + 1;
    return html;
  });
  // 마지막 줄바꿈 뒤에도 줄 높이가 생기도록 폭 없는 공백을 붙인다.
  return parts.join('\n') + '​';
}

// 캐릭터가 등장하는 화 목록: [{ chapter, count, first, len }]
export function appearances(char) {
  const m = buildMatcher([char]);
  if (!m) return [];
  const out = [];
  for (const ch of chaptersOf(char.workId)) {
    let count = 0, first = -1, len = 0;
    for (const x of ch.text.matchAll(m.re)) {
      if (first < 0) { first = x.index; len = x[0].length; }
      count++;
    }
    if (count) out.push({ chapter: ch, count, first, len });
  }
  return out;
}
