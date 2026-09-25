// AI 도우미 대화 저장. 작품마다 여러 개, 이 기기에만 (IndexedDB 'chats', 백업 파일에는 넣지 않는다).
//   chat = { id, workId, title, provider, model, history, items, createdAt, updatedAt }
//   history: 모델에게 다시 보낼 대화 (providers.js 모양), items: 화면에 보이는 질문·답
import { rawDB, uid } from '../store.js';

const S = 'chats';

function run(mode, fn) {
  const idb = rawDB();
  if (!idb) return Promise.resolve(null);
  return new Promise((resolve) => {
    let out = null;
    try {
      const tx = idb.transaction(S, mode);
      out = fn(tx.objectStore(S));
      tx.oncomplete = () => resolve(out?.result ?? out);
      tx.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export const newChat = (wid, provider, model) => ({ id: uid(), workId: wid, title: '', provider, model, history: [], items: [], createdAt: Date.now(), updatedAt: Date.now() });

// 최근 것부터
export async function chatsOf(wid) {
  const list = (await run('readonly', (s) => s.index('workId').getAll(IDBKeyRange.only(wid)))) || [];
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

// 저장할 때는 진행 중 표시를 빼고, 순수한 값만 (IndexedDB는 함수·DOM을 못 담는다)
export function saveChat(chat) {
  if (!chat.items.length) return Promise.resolve(null);
  const items = chat.items.filter((it) => it.a != null || it.error).map(({ q, a, usage, error }) => ({ q, a, usage, error }));
  const copy = JSON.parse(JSON.stringify({ ...chat, items }));
  return run('readwrite', (s) => s.put(copy));
}

export const deleteChat = (id) => run('readwrite', (s) => s.delete(id));
