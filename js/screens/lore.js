// 설정 자료 목록 (종류별, 폴더 안). 폴더는 필요한 사람만 쓰면 된다.
import { h, icon, iconBtn, topbar, ask, actions, confirmBox, toast, hintOnce, josa } from '../ui.js';
import { db, typeOf, entriesOf, foldersOf, createEntry, createFolder, deleteFolder, put } from '../store.js';
import { go, back } from '../router.js';
import { emit } from '../guide.js';

export function categoryScreen({ wid, type, fid }) {
  const w = db.works.get(wid);
  const t = typeOf(type);
  const folder = fid ? db.folders.get(fid) : null;
  if (!w || !t || (fid && !folder)) { go(w ? `/w/${wid}/lore` : '/', { replace: true }); return null; }
  const here = folder ? folder.id : null;
  const upTo = folder?.parentId ? `/w/${wid}/lore/${type}/${folder.parentId}` : folder ? `/w/${wid}/lore/${type}` : `/w/${wid}/lore`;
  const refresh = () => go(location.hash.slice(1), { replace: true });

  const addEntry = () => {
    const e = createEntry(wid, type, { folderId: here });
    if (type === 'character') emit('character-created');
    go(`/w/${wid}/e/${e.id}`);
  };
  const addFolder = async () => {
    const name = await ask('새 폴더', { placeholder: '폴더 이름', ok: '만들기' });
    if (name) { createFolder(wid, type, name, here); refresh(); }
  };

  const folders = foldersOf(wid, type, here);
  const entries = entriesOf(wid, type, here).filter((e) => e.name.trim());
  const noun = type === 'character' ? '캐릭터' : '항목';

  const body = folders.length || entries.length
    ? h('div', { class: 'list' },
      folders.map((f) => h('div', { class: 'row' },
        h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/lore/${type}/${f.id}`) },
          icon('folder', 'type-ic'),
          h('div', { class: 'row-title' }, f.name, h('span', { class: 'count' }, countIn(f)))),
        iconBtn('more', '폴더 메뉴', () => folderMenu(f, refresh)))),
      entries.map((e) => h('div', { class: 'row' },
        h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/e/${e.id}`) },
          e.color ? h('span', { class: 'dot lg', style: `--c:${e.color}` }) : icon(t.icon, 'type-ic'),
          h('div', null,
            h('div', { class: 'row-title' }, e.name),
            summary(e) ? h('div', { class: 'row-sub' }, summary(e)) : null)),
        icon('chev', 'chev'))))
    : h('div', { class: 'empty' },
      icon(t.icon, 'big'),
      h('p', null, folder ? '빈 폴더예요.' : `아직 ${t.label}${josa(t.label, '이', '가')} 없어요.`),
      h('button', { class: 'btn primary inline', onclick: addEntry }, icon('plus'), `${noun} 추가`));

  if (type !== 'character' && !folder) hintOnce('folders', '＋ 버튼에서 폴더를 만들어 자유롭게 정리할 수 있어요.');

  return h('div', { class: 'screen' },
    topbar({
      onBack: () => back(upTo),
      title: folder ? folder.name : t.label,
      right: [iconBtn('plus', '추가', () => actions([
        { label: `${noun} 추가`, run: addEntry },
        { label: '폴더 만들기', run: addFolder },
      ]))],
    }),
    h('main', { class: 'content' }, body));
}

function summary(e) {
  if (e.aliases?.length) return e.aliases.join(', ');
  const f = e.fields.find((f) => f.value.trim());
  return f ? `${f.label} ${f.value}` : (e.note || '').slice(0, 50);
}

function countIn(f) {
  let n = 0;
  for (const e of db.entries.values()) if (e.folderId === f.id && e.name.trim()) n++;
  for (const s of db.folders.values()) if (s.parentId === f.id) n++;
  return n;
}

function folderMenu(f, refresh) {
  actions([
    { label: '이름 바꾸기', run: async () => {
      const n = await ask('폴더 이름', { value: f.name });
      if (n) { f.name = n; put('folders', f); refresh(); }
    } },
    { label: '폴더 삭제', danger: true, run: async () => {
      if (await confirmBox('폴더만 지우고, 안에 있던 것은 한 단계 바깥으로 꺼내 둘게요.', { ok: '폴더 삭제', danger: true })) {
        deleteFolder(f.id);
        toast('폴더를 지웠어요.');
        refresh();
      }
    } },
  ], f.name);
}

// 설정 항목을 다른 폴더로 옮기기 (엔트리 화면에서 사용)
export function moveToFolder(e, done) {
  const opts = [{ label: '폴더 밖 (맨 위)', id: null }];
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
  })), '어디로 옮길까요?');
}
