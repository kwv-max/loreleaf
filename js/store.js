// 데이터 저장소: 전부 메모리에 올려두고, 바뀐 레코드만 IndexedDB에 기록한다.
const STORES = ['works', 'chapters', 'entries', 'folders'];
export const db = { works: new Map(), chapters: new Map(), entries: new Map(), folders: new Map() };
let idb = null;

export const TYPES = [
  { key: 'character', label: '캐릭터', icon: 'person', fields: ['나이', '현재 위치', '소속', '외모', '성격', '가진 물건', '몸 상태', '알고 있는 정보'] },
  { key: 'place', label: '장소', icon: 'pin', fields: ['위치', '분위기', '특징', '관련 인물'] },
  { key: 'org', label: '조직', icon: 'flag', fields: ['우두머리', '본거지', '목적', '구성원'] },
  { key: 'item', label: '아이템', icon: 'gem', fields: ['소유자', '능력', '생김새', '유래'] },
  { key: 'world', label: '세계관', icon: 'globe', fields: ['요약', '규칙', '예외'] },
  { key: 'memo', label: '기타 메모', icon: 'note', fields: [] },
];
export const typeOf = (key) => TYPES.find((t) => t.key === key);

export const COLORS = ['#f2b53a', '#f58fb0', '#6fb7f2', '#7cc98a', '#b99bf5', '#ff9f68', '#4fc9bd', '#c9a27c'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function initStore() {
  try {
    idb = await new Promise((res, rej) => {
      const r = indexedDB.open('loreleaf', 1);
      r.onupgradeneeded = () => {
        for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    for (const s of STORES) {
      const all = await req(idb.transaction(s).objectStore(s).getAll());
      for (const o of all) db[s].set(o.id, o);
    }
  } catch (e) {
    console.warn('IndexedDB unavailable', e);
    idb = null;
  }
  recoverDraft();
  return !!idb;
}

export function put(store, obj, { touch = true } = {}) {
  if (touch) obj.updatedAt = Date.now();
  db[store].set(obj.id, obj);
  if (!idb) return Promise.resolve();
  return new Promise((res) => {
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = res;
    tx.onerror = () => { console.warn(tx.error); res(); };
  });
}

export function del(store, id) {
  db[store].delete(id);
  if (idb) idb.transaction(store, 'readwrite').objectStore(store).delete(id);
}

// 편집 중인 본문은 localStorage에도 즉시 남겨서, IndexedDB 기록 전에 앱이 꺼져도 복구한다.
const DRAFT = 'll:draft';
export function stashDraft(id, text) {
  try { localStorage.setItem(DRAFT, JSON.stringify({ id, text, t: Date.now() })); } catch {}
}
export function clearDraft(id) {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (d && d.id === id) localStorage.removeItem(DRAFT);
  } catch {}
}
function recoverDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    localStorage.removeItem(DRAFT);
    const c = d && db.chapters.get(d.id);
    if (c && d.t > (c.updatedAt || 0) && d.text !== c.text) {
      c.text = d.text;
      put('chapters', c);
    }
  } catch {}
}

// ---- 조회 ----
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt;

export const worksSorted = () => [...db.works.values()].sort((a, b) => b.updatedAt - a.updatedAt);
export const chaptersOf = (wid) => [...db.chapters.values()].filter((c) => c.workId === wid).sort(byOrder);
export const charactersOf = (wid) => [...db.entries.values()].filter((e) => e.workId === wid && e.type === 'character' && e.name.trim());
export function entriesOf(wid, type, folderId) {
  return [...db.entries.values()]
    .filter((e) => e.workId === wid && e.type === type && (folderId === undefined || (e.folderId || null) === folderId))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
export function foldersOf(wid, type, parentId = null) {
  return [...db.folders.values()]
    .filter((f) => f.workId === wid && f.type === type && (f.parentId || null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// ---- 생성 / 삭제 ----
export function createWork(title) {
  const now = Date.now();
  const w = { id: uid(), title, createdAt: now, updatedAt: now, lastChapterId: null };
  put('works', w);
  const c = createChapter(w.id);
  w.lastChapterId = c.id;
  put('works', w);
  return w;
}

export function createChapter(wid) {
  const list = chaptersOf(wid);
  const order = list.length ? Math.max(...list.map((c) => c.order)) + 1 : 1;
  const c = { id: uid(), workId: wid, title: `${list.length + 1}화`, order, text: '', createdAt: Date.now() };
  put('chapters', c);
  return c;
}

export function createEntry(wid, type, { name = '', folderId = null } = {}) {
  const used = [...db.entries.values()].filter((e) => e.workId === wid && e.type === 'character').length;
  const e = {
    id: uid(), workId: wid, type, folderId, name,
    aliases: [], fields: [], note: '',
    color: type === 'character' ? COLORS[used % COLORS.length] : null,
    createdAt: Date.now(),
  };
  put('entries', e);
  return e;
}

export function createFolder(wid, type, name, parentId = null) {
  const f = { id: uid(), workId: wid, type, parentId, name, createdAt: Date.now() };
  put('folders', f);
  return f;
}

// 폴더를 지워도 안의 내용은 한 단계 바깥으로 옮길 뿐 잃지 않는다.
export function deleteFolder(fid) {
  const f = db.folders.get(fid);
  if (!f) return;
  for (const e of db.entries.values()) if (e.folderId === fid) { e.folderId = f.parentId || null; put('entries', e); }
  for (const s of db.folders.values()) if (s.parentId === fid) { s.parentId = f.parentId || null; put('folders', s); }
  del('folders', fid);
}

export function deleteWork(wid) {
  for (const s of ['chapters', 'entries', 'folders']) for (const o of [...db[s].values()]) if (o.workId === wid) del(s, o.id);
  del('works', wid);
}

export function touchWork(wid) {
  const w = db.works.get(wid);
  if (w) put('works', w);
}

// ---- 백업 ----
export function exportAll() {
  const o = { app: 'loreleaf', version: 1, exportedAt: new Date().toISOString() };
  for (const s of STORES) o[s] = [...db[s].values()];
  return o;
}
export async function importAll(o) {
  if (!o || o.app !== 'loreleaf') throw new Error('갈피 백업 파일이 아니에요.');
  for (const s of STORES) for (const x of o[s] || []) await put(s, x, { touch: false });
}
