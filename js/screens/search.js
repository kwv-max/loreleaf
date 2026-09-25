// 작품 전체 찾기: 원고와 설정 자료를 한 번에. 결과를 누르면 그 자리로 간다.
import { h, icon, iconBtn, debounce, num, josa } from '../ui.js';
import { db, chaptersOf, typeOf, iconOf } from '../store.js';
import { findRe, escRe } from '../highlight.js';
import { go, back } from '../router.js';
import { setJump } from './editor.js';
import { t as tr } from '../i18n.js';

let lastQuery = '';
export function setSearchQuery(q) { lastQuery = q || ''; }

const PER_CHAPTER = 3;

// 찾은 자리 앞뒤를 잘라 보여준다.
function snippet(text, index, len) {
  const from = Math.max(0, index - 18);
  const to = Math.min(text.length, index + len + 40);
  const clean = (s) => s.replace(/\s+/g, ' ');
  return h('div', { class: 'snippet' },
    from > 0 ? '…' : '', clean(text.slice(from, index)),
    h('mark', { class: 'hit' }, text.slice(index, index + len)),
    clean(text.slice(index + len, to)), to < text.length ? '…' : '');
}

// 설정 한 장에서 어디가 맞았는지 (이름 → 별명 → 항목 → 메모 순)
function entryHit(e, q) {
  const re = new RegExp(escRe(q), 'i');
  const at = (text) => { const m = text.match(re); return m ? { text, index: m.index, len: m[0].length } : null; };
  if (re.test(e.name)) return null; // 이름이 맞으면 이름 자체가 결과
  for (const a of e.aliases || []) if (re.test(a)) return { label: tr('search.alias'), ...at(a) };
  for (const f of e.fields) {
    if (re.test(f.value)) return { label: f.label || tr('fact.setting'), ...at(f.value) };
    for (const c of f.changes || []) {
      if (re.test(c.value)) return { label: tr('search.from', { label: f.label || tr('fact.setting'), title: db.chapters.get(c.chapterId)?.title || '?' }), ...at(c.value) };
    }
    if (re.test(f.label)) return { label: tr('search.field'), ...at(`${f.label}: ${f.value}`) };
  }
  if (re.test(e.note)) return { label: tr('search.note'), ...at(e.note) };
  return undefined;
}

export function searchScreen({ wid }) {
  const w = db.works.get(wid);
  if (!w) { go('/', { replace: true }); return null; }

  const input = h('input', {
    class: 'search-input', type: 'search', value: lastQuery,
    placeholder: tr('search.ph'), enterkeyhint: 'search', 'aria-label': tr('search.query'),
  });
  const results = h('div', { class: 'search-results' });

  function draw() {
    const q = input.value.trim();
    lastQuery = input.value;
    if (!q) {
      results.replaceChildren(h('p', { class: 'muted search-hint' }, tr('search.hint')));
      return;
    }
    const re = findRe(q);

    // 원고
    const groups = [];
    let total = 0;
    for (const c of chaptersOf(wid)) {
      const hits = [...c.text.matchAll(re)].map((x) => ({ index: x.index, len: x[0].length }));
      if (hits.length) { groups.push({ c, hits }); total += hits.length; }
    }
    const open = (c, hit) => { setJump(c.id, hit.index, hit.len, q); go(`/w/${wid}/c/${c.id}`); };
    const msSec = groups.length && h('section', { class: 'entry-sec' },
      h('h3', null, tr('search.ms'), h('span', { class: 'count' }, tr('search.hits', { n: num(total) }))),
      groups.map(({ c, hits }) => h('div', { class: 'result-group' },
        h('button', { class: 'result-head', onclick: () => open(c, hits[0]) },
          h('span', null, c.title), h('span', { class: 'muted' }, tr('search.hits', { n: hits.length }))),
        hits.slice(0, PER_CHAPTER).map((hit) => h('button', { class: 'result', onclick: () => open(c, hit) }, snippet(c.text, hit.index, hit.len))),
        hits.length > PER_CHAPTER
          ? h('button', { class: 'result more', onclick: () => open(c, hits[PER_CHAPTER]) }, tr('search.moreIn', { n: hits.length - PER_CHAPTER }))
          : null)));

    // 설정 자료
    const found = [...db.entries.values()]
      .filter((e) => e.workId === wid && e.name.trim())
      .map((e) => ({ e, hit: entryHit(e, q) }))
      .filter((x) => x.hit !== undefined)
      .sort((a, b) => (a.hit ? 1 : 0) - (b.hit ? 1 : 0) || a.e.name.localeCompare(b.e.name, 'ko'));
    const loreSec = found.length && h('section', { class: 'entry-sec' },
      h('h3', null, tr('search.lore'), h('span', { class: 'count' }, found.length)),
      h('div', { class: 'list' }, found.map(({ e, hit }) => h('div', { class: 'row' },
        h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/e/${e.id}`) },
          e.color ? h('span', { class: 'dot lg', style: `--c:${e.color}` }) : icon(iconOf(e), 'type-ic'),
          h('div', null,
            h('div', { class: 'row-title' }, e.name, h('span', { class: 'muted small' }, typeOf(e.type).label)),
            hit ? h('div', { class: 'row-sub' }, hit.label + ' · ', snippet(hit.text, hit.index, hit.len)) : null)),
        icon('chev', 'chev')))));

    results.replaceChildren(...(msSec || loreSec
      ? [msSec, loreSec].filter(Boolean)
      : [h('p', { class: 'muted search-hint' }, tr('search.none', { q }))]));
  }

  input.addEventListener('input', debounce(draw, 150));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  draw();
  setTimeout(() => { input.focus(); input.select(); }, 60);

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar-row' },
        iconBtn('back', tr('common.back'), () => back('/w/' + wid)),
        h('div', { class: 'search-field' }, icon('search', 'search-ic'), input))),
    h('main', { class: 'content' }, results));
}
