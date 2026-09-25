// 데이터 저장소: 전부 메모리에 올려두고, 바뀐 레코드만 IndexedDB에 기록한다.
import { migrateChapter } from './quotes.js';
const STORES = ['works', 'chapters', 'entries', 'folders', 'relations'];
export const db = { works: new Map(), chapters: new Map(), entries: new Map(), folders: new Map(), relations: new Map() };
let idb = null;

export const TYPES = [
  { key: 'character', label: '캐릭터', icon: 'person', fields: ['나이', '현재 위치', '소속', '외모', '성격', '가진 물건', '몸 상태', '알고 있는 정보'] },
  { key: 'place', label: '장소', icon: 'pin', fields: ['위치', '분위기', '특징', '관련 인물'] },
  { key: 'org', label: '조직', icon: 'flag', fields: ['우두머리', '본거지', '목적', '구성원'] },
  { key: 'item', label: '아이템', icon: 'gem', fields: ['소유자', '능력', '생김새', '유래'] },
  { key: 'world', label: '세계관', icon: 'globe', fields: ['요약', '규칙', '예외'] },
  { key: 'memo', label: '기타 메모', icon: 'note', fields: [] },
];
// 작품마다 분류를 더 만들 수 있고, 아이콘도 바꿀 수 있다.
//   work.types = [{ key, label, icon, fields: [] }]  직접 만든 분류
//   work.icons = { 분류 key: 아이콘 }               기본 분류의 아이콘 바꾸기
//   entry.icon                                    항목 하나만 다른 아이콘
export function typeOf(key, wid) {
  let t = TYPES.find((x) => x.key === key);
  if (!t) {
    for (const w of db.works.values()) {
      t = w.types?.find((x) => x.key === key);
      if (t) { wid ??= w.id; break; }
    }
  }
  if (!t) return { key, label: '분류 없음', icon: 'note', fields: [] };
  const ic = wid && db.works.get(wid)?.icons?.[key];
  return ic ? { ...t, icon: ic } : t;
}
// 작품의 분류 목록: 기본 분류, 직접 만든 분류, 기타 메모 순
export function typesOf(wid) {
  const w = db.works.get(wid);
  const base = TYPES.map((t) => typeOf(t.key, wid));
  return [...base.slice(0, -1), ...(w?.types || []), base[base.length - 1]];
}
export const isCustomType = (key) => !TYPES.some((t) => t.key === key);
export const iconOf = (e) => e.icon || typeOf(e.type, e.workId).icon;

export function createType(wid, label, icon) {
  const w = db.works.get(wid);
  const t = { key: 't' + uid(), label, icon: icon || 'note', fields: [] };
  (w.types ||= []).push(t);
  put('works', w);
  return t;
}
export function setTypeIcon(wid, key, icon) {
  const w = db.works.get(wid);
  const own = w.types?.find((x) => x.key === key);
  if (own) own.icon = icon;
  else (w.icons ||= {})[key] = icon;
  put('works', w);
}
// 직접 만든 분류를 지우면 안의 설정은 '기타 메모'로 옮긴다 (잃지 않는다)
export function deleteType(wid, key) {
  const w = db.works.get(wid);
  for (const e of db.entries.values()) if (e.workId === wid && e.type === key) { e.type = 'memo'; e.folderId = null; put('entries', e); }
  for (const f of [...db.folders.values()]) if (f.workId === wid && f.type === key) del('folders', f.id);
  w.types = (w.types || []).filter((x) => x.key !== key);
  put('works', w);
}

export const COLORS = ['#f2b53a', '#f58fb0', '#6fb7f2', '#7cc98a', '#b99bf5', '#ff9f68', '#4fc9bd', '#c9a27c'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// 다른 창의 옛 갈피 때문에 저장소를 못 열 때 알려 줄 곳 (app.js가 정한다)
let onBlocked = null;
export async function initStore({ blocked } = {}) {
  onBlocked = blocked;
  try {
    idb = await new Promise((res, rej) => {
      const r = indexedDB.open('loreleaf', 3); // 2: 관계(relations), 3: 화별 이전 버전(versions)
      r.onupgradeneeded = () => {
        for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
        // 이전 버전은 쌓이면 무거워서 메모리에 올리지 않고, 볼 때만 화별로 꺼낸다 (versions.js)
        if (!r.result.objectStoreNames.contains('versions')) {
          const v = r.result.createObjectStore('versions', { keyPath: 'id' });
          v.createIndex('chapterId', 'chapterId');
          v.createIndex('workId', 'workId');
        }
      };
      // 저장소 모양이 바뀌는 업데이트 때, 다른 창에 열린 옛 갈피가 붙잡고 있으면 여기서 기다리게 된다
      r.onblocked = () => onBlocked?.();
      r.onsuccess = () => {
        // 앞으로 새 버전이 저장소를 바꾸려 하면, 이 창은 비켜 주고 새로고침한다
        r.result.onversionchange = () => { r.result.close(); location.reload(); };
        res(r.result);
      };
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
  migrateAll();
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
export function stashDraft(id, text, quotes, notes) {
  try { localStorage.setItem(DRAFT, JSON.stringify({ id, text, quotes, notes, t: Date.now() })); } catch {}
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
    if (c && d.t > (c.updatedAt || 0)) {
      c.text = d.text;
      if (d.quotes) c.quotes = d.quotes;
      if (d.notes) c.notes = d.notes;
      put('chapters', c);
    }
  } catch {}
}

// 따옴표를 글자로 쓰던 예전 원고를 대사 줄 표시로 옮긴다 (한 번만).
export function migrateAll() {
  for (const c of db.chapters.values()) if (migrateChapter(c)) put('chapters', c, { touch: false });
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
  const c = { id: uid(), workId: wid, title: `${list.length + 1}화`, order, text: '', quotes: {}, createdAt: Date.now() };
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

// ---- 관계 (캐릭터끼리) ----
// 두 사람 사이에 기록은 딱 하나: { id, workId, pair: [a, b], ab: a가 b를 보는 한 줄, ba: b가 a를 보는 한 줄 }
// 한쪽에서 적으면 양쪽 화면에 다 보이고, 서로 말이 어긋날 수 없다.
// 각 줄은 설정 항목과 같은 모양({ value, changes })이라 '몇 화부터 바뀜'을 그대로 쓴다.
export const relationsOf = (eid) => [...db.relations.values()].filter((r) => r.pair.includes(eid));
export const relationBetween = (a, b) => [...db.relations.values()].find((r) => r.pair.includes(a) && r.pair.includes(b));
export function createRelation(wid, a, b) {
  const side = () => ({ id: uid(), label: '', value: '' });
  const r = { id: uid(), workId: wid, pair: [a, b], ab: side(), ba: side(), createdAt: Date.now() };
  put('relations', r);
  return r;
}
// 보는 사람(me) 기준으로 [내가 상대를, 상대가 나를]
export const sidesFor = (r, me) => (r.pair[0] === me ? [r.ab, r.ba] : [r.ba, r.ab]);
export const otherOf = (r, me) => (r.pair[0] === me ? r.pair[1] : r.pair[0]);
export const isBlankRelation = (r) => [r.ab, r.ba].every((s) => !s.value.trim() && !s.changes?.length);
// 설정(entries)과 관계(relations) 중 어느 저장소의 기록인지
export const recordStore = (o) => (o.pair ? 'relations' : 'entries');
// 캐릭터를 지우면 그 사람의 관계도 함께 지운다 (되돌리기용으로 지운 것을 돌려준다)
export function removeRelationsOf(eid) {
  const gone = relationsOf(eid);
  for (const r of gone) del('relations', r.id);
  return gone;
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
  deleteVersionsOfWork(wid);
  for (const s of ['chapters', 'entries', 'folders', 'relations']) for (const o of [...db[s].values()]) if (o.workId === wid) del(s, o.id);
  del('works', wid);
}

export function touchWork(wid) {
  const w = db.works.get(wid);
  if (w) put('works', w);
}

// ---- 이전 버전 저장소 (versions.js에서만 쓴다) ----
export const rawDB = () => idb;
function deleteVersionsOfWork(wid) {
  if (!idb) return;
  const tx = idb.transaction('versions', 'readwrite');
  const q = tx.objectStore('versions').index('workId').openCursor(IDBKeyRange.only(wid));
  q.onsuccess = () => { const c = q.result; if (c) { c.delete(); c.continue(); } };
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
  migrateAll();
}
