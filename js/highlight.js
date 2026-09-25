// 본문 뒤에 까는 표시용 레이어. 원고 텍스트는 건드리지 않고 화면에만 그린다.
//  - 캐릭터 이름·별명 형광펜
//  - 대사 줄의 여백 따옴표
//  - 찾기 결과 표시 (별도 레이어)
import { esc } from './ui.js';
import { chaptersOf } from './store.js';

export const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termsOf(c) {
  return [c.name, ...(c.aliases || [])].map((t) => (t || '').trim()).filter(Boolean);
}

// 같은 이름·별명을 여러 캐릭터가 쓰면 모두 기억해 둔다 (탭하면 고르게).
export function buildMatcher(chars) {
  const map = new Map();
  for (const c of chars) for (const t of termsOf(c)) {
    const list = map.get(t) || [];
    if (!list.includes(c)) list.push(c);
    map.set(t, list);
  }
  if (!map.size) return null;
  // 긴 이름부터 맞춰야 '검은 여우'가 '여우'보다 먼저 잡힌다.
  const terms = [...map.keys()].sort((a, b) => b.length - a.length);
  return { re: new RegExp(terms.map(escRe).join('|'), 'g'), map };
}

// 문단 하나를 블록으로. textarea도 줄바꿈마다 새 줄에서 시작하므로 배치가 똑같다.
// 빈 문단도 한 줄 높이를 갖도록 폭 없는 공백을 넣는다.
const block = (pos, inner, flag) =>
  `<div class="p${flag ? ' ' + flag + 'q' : ''}" data-s="${pos}">${inner || '​'}</div>`;

function namesHTML(text, m, base) {
  if (!m) return esc(text);
  let out = '';
  let last = 0;
  for (const x of text.matchAll(m.re)) {
    const cs = m.map.get(x[0]);
    const multi = cs.length > 1
      ? ` class="multi" style="--c:${cs[0].color};--c2:${cs[1].color}"`
      : ` style="--c:${cs[0].color}"`;
    out += esc(text.slice(last, x.index)) +
      `<mark data-id="${cs.map((c) => c.id).join(',')}" data-i="${base + x.index}"${multi}>${esc(x[0])}</mark>`;
    last = x.index + x[0].length;
  }
  return out + esc(text.slice(last));
}

export function highlightHTML(text, m, flags = []) {
  let pos = 0;
  return text.split('\n').map((p, i) => {
    const html = block(pos, namesHTML(p, m, pos), flags[i]);
    pos += p.length + 1;
    return html;
  }).join('');
}

// ---- 찾기 ----
export function findRe(query) {
  const q = (query || '').trim();
  return q ? new RegExp(escRe(q), 'gi') : null;
}

export function findAll(text, query) {
  const re = findRe(query);
  return re ? [...text.matchAll(re)].map((x) => ({ index: x.index, len: x[0].length })) : [];
}

export function findHTML(text, query, cur = -1) {
  const re = findRe(query);
  let pos = 0, n = 0;
  return text.split('\n').map((p) => {
    let inner = '';
    let last = 0;
    if (re) for (const x of p.matchAll(re)) {
      inner += esc(p.slice(last, x.index)) +
        `<mark class="hit${n === cur ? ' cur' : ''}" data-n="${n}">${esc(x[0])}</mark>`;
      n++;
      last = x.index + x[0].length;
    }
    inner += esc(p.slice(last));
    const html = block(pos, inner, 0);
    pos += p.length + 1;
    return html;
  }).join('');
}

// 한 구간만 칠하기 (AI 도우미의 '3화 12줄'처럼 다른 곳에서 그 자리를 가리킬 때). 찾기 층에 잠깐 그린다.
export function rangeHTML(text, from, len) {
  let pos = 0;
  return text.split('\n').map((p) => {
    const a = Math.max(0, from - pos), b = Math.min(p.length, from + len - pos);
    const inner = a < b ? esc(p.slice(0, a)) + `<mark class="hit cur">${esc(p.slice(a, b))}</mark>` + esc(p.slice(b)) : esc(p);
    const html = block(pos, inner, 0);
    pos += p.length + 1;
    return html;
  }).join('');
}

// ---- 주석 ----
// 주석이 달린 글자 구간을 점선 밑줄로. 겹치면 나중에 단 주석이 위.
export function notesHTML(text, notes) {
  const live = notes.filter((n) => n.end > n.start);
  if (!live.length) return '';
  const owner = new Array(text.length).fill(null);
  for (const n of live) for (let i = Math.max(0, n.start); i < Math.min(text.length, n.end); i++) owner[i] = n.id;
  let pos = 0;
  return text.split('\n').map((p) => {
    let inner = '';
    for (let i = 0; i < p.length;) {
      const id = owner[pos + i];
      let j = i + 1;
      while (j < p.length && owner[pos + j] === id) j++;
      const seg = esc(p.slice(i, j));
      inner += id ? `<span class="nt" data-note="${id}">${seg}</span>` : seg;
      i = j;
    }
    const html = block(pos, inner, 0);
    pos += p.length + 1;
    return html;
  }).join('');
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
