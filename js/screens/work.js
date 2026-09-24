// 작품 화면. 탭은 딱 두 개: 원고(화 목록)와 설정(설정 자료).
import { h, icon, iconBtn, topbar, num, relTime, ask, actions, toast, josa } from '../ui.js';
import { db, chaptersOf, createChapter, put, del, TYPES, entriesOf } from '../store.js';
import { go, back } from '../router.js';
import { workMenu } from './library.js';

function tabs(wid, active) {
  const tab = (key, label, to) => h('button', {
    class: 'tab' + (active === key ? ' on' : ''),
    'aria-selected': active === key,
    onclick: () => active !== key && go(to, { replace: true }),
  }, label);
  return h('div', { class: 'tabs', role: 'tablist' },
    tab('ms', '원고', '/w/' + wid),
    tab('lore', '설정', `/w/${wid}/lore`));
}

function shell(w, active, body, bottom) {
  return h('div', { class: 'screen' },
    topbar({
      onBack: () => back('/'),
      title: w.title,
      right: [iconBtn('more', '작품 메뉴', () => workMenu(w, { onDeleted: () => go('/', { replace: true }) }))],
    }),
    tabs(w.id, active),
    h('main', { class: 'content' }, body),
    bottom);
}

export function manuscriptScreen({ wid }) {
  const w = db.works.get(wid);
  if (!w) { go('/', { replace: true }); return null; }
  const list = chaptersOf(wid);

  const rows = h('div', { class: 'list' }, list.map((c, i) => {
    const text = c.text.trim();
    return h('div', { class: 'row' + (c.id === w.lastChapterId ? ' current' : '') },
      h('button', { class: 'row-main', onclick: () => go(`/w/${wid}/c/${c.id}`) },
        h('div', { class: 'row-title' }, c.title),
        h('div', { class: 'row-sub' }, text ? `${num(c.text.length)}자 · ${relTime(c.updatedAt)}` : '비어 있음'),
        text ? h('div', { class: 'row-snippet' }, text.slice(0, 70).replace(/\s+/g, ' ')) : null),
      iconBtn('more', '화 메뉴', () => chapterMenu(c, i, list)));
  }));

  return shell(w, 'ms', rows,
    h('div', { class: 'bottom-bar' }, h('button', {
      class: 'btn primary',
      onclick: () => { const c = createChapter(wid); go(`/w/${wid}/c/${c.id}`); },
    }, icon('plus'), '새 화')));
}

function chapterMenu(c, i, list) {
  const swap = (j) => {
    const o = list[j];
    [c.order, o.order] = [o.order, c.order];
    put('chapters', c, { touch: false });
    put('chapters', o, { touch: false });
    go(location.hash.slice(1), { replace: true });
  };
  actions([
    { label: '제목 바꾸기', run: async () => {
      const t = await ask('화 제목', { value: c.title });
      if (t) { c.title = t; put('chapters', c); go(location.hash.slice(1), { replace: true }); }
    } },
    i > 0 && { label: '위로 옮기기', run: () => swap(i - 1) },
    i < list.length - 1 && { label: '아래로 옮기기', run: () => swap(i + 1) },
    { label: '삭제', danger: true, run: () => {
      del('chapters', c.id);
      go(location.hash.slice(1), { replace: true });
      toast(`‘${c.title}’${josa(c.title, '을', '를')} 지웠어요.`, {
        action: '되돌리기', duration: 6000,
        onAction: () => { put('chapters', c, { touch: false }); go(location.hash.slice(1), { replace: true }); },
      });
    } },
  ], c.title);
}

export function loreScreen({ wid }) {
  const w = db.works.get(wid);
  if (!w) { go('/', { replace: true }); return null; }
  const rows = h('div', { class: 'list' }, TYPES.map((t) => {
    const items = entriesOf(wid, t.key).filter((e) => e.name.trim());
    const preview = items.slice(0, 3).map((e) => e.name).join(', ') + (items.length > 3 ? ` 외 ${items.length - 3}` : '');
    return h('div', { class: 'row' },
      h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/lore/${t.key}`) },
        icon(t.icon, 'type-ic'),
        h('div', null,
          h('div', { class: 'row-title' }, t.label, items.length ? h('span', { class: 'count' }, items.length) : null),
          preview ? h('div', { class: 'row-sub' }, preview) : null)),
      icon('chev', 'chev'));
  }));
  return shell(w, 'lore', rows);
}
