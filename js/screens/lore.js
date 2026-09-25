// 설정 자료 목록 (종류별, 폴더 안). 폴더는 필요한 사람만 쓰면 된다.
import { h, icon, iconBtn, topbar, ask, actions, confirmBox, toast, hintOnce, josa, pickIcon } from '../ui.js';
import {
  db, typeOf, iconOf, isCustomType, setTypeIcon, deleteType, entriesOf, foldersOf, createEntry, createFolder, deleteFolder, put,
} from '../store.js';
import { go, back } from '../router.js';
import { emit } from '../guide.js';
import { orderOf, valueAt, viewAtFor, setViewAt } from '../timeline.js';
import { t as tr } from '../i18n.js';

export function categoryScreen({ wid, type, fid }) {
  const w = db.works.get(wid);
  const custom = isCustomType(type);
  const t = typeOf(type, wid);
  const folder = fid ? db.folders.get(fid) : null;
  if (!w || (custom && !w.types?.some((x) => x.key === type)) || (fid && !folder)) { go(w ? `/w/${wid}/lore` : '/', { replace: true }); return null; }
  const here = folder ? folder.id : null;
  const upTo = folder?.parentId ? `/w/${wid}/lore/${type}/${folder.parentId}` : folder ? `/w/${wid}/lore/${type}` : `/w/${wid}/lore`;
  const refresh = () => go(location.hash.slice(1), { replace: true });

  const addEntry = () => {
    const e = createEntry(wid, type, { folderId: here });
    if (type === 'character') emit('character-created');
    go(`/w/${wid}/e/${e.id}`);
  };
  const addFolder = async () => {
    const name = await ask(tr('lore.newFolder'), { placeholder: tr('lore.folderName'), ok: tr('lore.create') });
    if (name) { createFolder(wid, type, name, here); refresh(); }
  };

  const folders = foldersOf(wid, type, here);
  const entries = entriesOf(wid, type, here).filter((e) => e.name.trim());
  const noun = type === 'character' ? tr('lore.character') : tr('lore.item');

  const body = folders.length || entries.length
    ? h('div', { class: 'list' },
      folders.map((f) => h('div', { class: 'row' },
        h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/lore/${type}/${f.id}`) },
          icon('folder', 'type-ic'),
          h('div', { class: 'row-title' }, f.name, h('span', { class: 'count' }, countIn(f)))),
        iconBtn('more', tr('lore.folderMenu'), () => folderMenu(f, refresh)))),
      entries.map((e) => h('div', { class: 'row' },
        h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/e/${e.id}`) },
          e.color ? h('span', { class: 'dot lg', style: `--c:${e.color}` }) : icon(iconOf(e), 'type-ic'),
          h('div', null,
            h('div', { class: 'row-title' }, e.name),
            summary(e) ? h('div', { class: 'row-sub' }, summary(e)) : null)),
        icon('chev', 'chev'))))
    : h('div', { class: 'empty' },
      icon(t.icon, 'big'),
      h('p', null, folder ? tr('lore.emptyFolder') : tr('lore.emptyType', { label: t.label })),
      h('button', { class: 'btn primary inline', onclick: addEntry }, icon('plus'), tr('lore.addNoun', { noun })));

  if (type !== 'character' && !folder) hintOnce('folders', tr('lore.folderHint'));

  return h('div', { class: 'screen' },
    topbar({
      onBack: () => back(upTo),
      title: folder ? folder.name : t.label,
      right: [
        iconBtn('plus', tr('common.add'), () => actions([
          { label: tr('lore.addNoun', { noun }), run: addEntry },
          { label: tr('lore.makeFolder'), run: addFolder },
        ])),
        folder ? null : iconBtn('more', tr('lore.typeMenu'), () => typeMenu(w, t, custom, refresh)),
      ],
    }),
    h('main', { class: 'content' }, atBanner(wid), body));
}

// 분류 메뉴: 아이콘 바꾸기, (직접 만든 분류는) 이름 바꾸기·지우기
function typeMenu(w, t, custom, refresh) {
  const changeIcon = async () => {
    const ic = await pickIcon(t.icon, { title: tr('lore.changeIconTitle', { label: t.label }) });
    if (ic) { setTypeIcon(w.id, t.key, ic); refresh(); }
  };
  if (!custom) { changeIcon(); return; } // 기본 분류는 바꿀 게 아이콘뿐이라 바로 고르기
  actions([
    { label: tr('lore.changeIcon'), run: changeIcon },
    custom && { label: tr('common.rename'), run: async () => {
      const n = await ask(tr('lore.typeName'), { value: t.label });
      if (n) { w.types.find((x) => x.key === t.key).label = n; put('works', w); refresh(); }
    } },
    custom && { label: tr('lore.deleteType'), danger: true, run: async () => {
      const n = entriesOf(w.id, t.key).length;
      const msg = n ? tr('lore.deleteTypeMove', { n }) : tr('lore.deleteTypeEmpty');
      if (await confirmBox(msg, { ok: tr('lore.deleteType'), danger: true })) {
        deleteType(w.id, t.key);
        toast(tr('lore.typeDeleted', { label: t.label }));
        go(`/w/${w.id}/lore`, { replace: true });
      }
    } },
  ].filter(Boolean), t.label);
}

// 글을 쓰다 '설정 보기'로 왔으면 그 화 시점이라는 걸 알려 주고, 풀 수 있게
export function atBanner(wid) {
  const cid = viewAtFor(wid);
  if (!cid) return null;
  return h('div', { class: 'at-banner' },
    h('span', null, tr('lore.viewingAt', { title: db.chapters.get(cid).title })),
    h('button', { class: 'link-btn', onclick: () => { setViewAt(null); go(location.hash.slice(1), { replace: true }); } }, tr('lore.latest')));
}

function summary(e) {
  if (e.aliases?.length) return e.aliases.join(', ');
  const order = orderOf(e.workId);
  const cid = viewAtFor(e.workId);
  const at = cid ? order.get(cid) : Infinity;
  for (const f of e.fields) {
    const v = valueAt(f, at, order).value;
    if (v.trim()) return `${f.label} ${v}`;
  }
  return (e.note || '').slice(0, 50);
}

function countIn(f) {
  let n = 0;
  for (const e of db.entries.values()) if (e.folderId === f.id && e.name.trim()) n++;
  for (const s of db.folders.values()) if (s.parentId === f.id) n++;
  return n;
}

function folderMenu(f, refresh) {
  actions([
    { label: tr('common.rename'), run: async () => {
      const n = await ask(tr('lore.folderName'), { value: f.name });
      if (n) { f.name = n; put('folders', f); refresh(); }
    } },
    { label: tr('lore.deleteFolder'), danger: true, run: async () => {
      if (await confirmBox(tr('lore.deleteFolderConfirm'), { ok: tr('lore.deleteFolder'), danger: true })) {
        deleteFolder(f.id);
        toast(tr('lore.folderDeleted'));
        refresh();
      }
    } },
  ], f.name);
}

// 설정 항목을 다른 폴더로 옮기기 (엔트리 화면에서 사용)
export function moveToFolder(e, done) {
  const opts = [{ label: tr('lore.outside'), id: null }];
  const walk = (parent, depth) => {
    for (const f of foldersOf(e.workId, e.type, parent)) {
      opts.push({ label: '　'.repeat(depth) + f.name, id: f.id });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  actions(opts.map((o) => ({
    label: (o.id === (e.folderId || null) ? '✓ ' : '') + o.label,
    run: () => { e.folderId = o.id; put('entries', e); done?.(); },
  })), tr('lore.moveWhere'));
}
