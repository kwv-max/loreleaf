// 백업 파일. 처음 한 번 저장할 파일을 고르면, 다음부터는 그 파일에 덮어쓴다 (안드로이드·PC 크롬).
// 파일을 직접 고칠 수 없는 브라우저(아이폰 사파리 등)는 예전처럼 새 파일로 내려받는다.
import { exportAll } from './store.js';
import { download } from './ui.js';

// 고른 파일의 손잡이(handle)는 JSON으로 못 바꾸니 작품 데이터와 따로 IndexedDB에 둔다.
function kv(mode, fn) {
  return new Promise((resolve) => {
    const r = indexedDB.open('loreleaf-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => resolve(null);
    r.onsuccess = () => {
      let tx, q;
      try {
        tx = r.result.transaction('kv', mode);
        q = fn(tx.objectStore('kv'));
      } catch { resolve(null); r.result.close(); return; }
      tx.oncomplete = () => { resolve(q?.result ?? null); r.result.close(); };
      tx.onerror = () => { resolve(null); r.result.close(); };
    };
  });
}
const getHandle = () => kv('readonly', (s) => s.get('backup'));
const setHandle = (h) => kv('readwrite', (s) => s.put(h, 'backup'));

export const canOverwrite = () => 'showSaveFilePicker' in window;

// 마지막으로 백업한 파일 이름과 시각 (메뉴에 보여 주기용)
export function lastBackup() {
  try { return JSON.parse(localStorage.getItem('ll:backup') || 'null'); } catch { return null; }
}
function remember(name) {
  try { localStorage.setItem('ll:backup', JSON.stringify({ name, at: Date.now() })); } catch {}
}

function dated() {
  const d = new Date();
  return `갈피-백업-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
}

async function writable(handle) {
  try {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted' || (await handle.requestPermission(opts)) === 'granted') return handle;
  } catch {}
  return null;
}

// 저장한 파일 이름을 돌려준다. 파일 고르기를 취소하면 null.
export async function saveBackup({ pickNew = false } = {}) {
  const text = JSON.stringify(exportAll());
  if (!canOverwrite()) {
    const name = dated();
    download(name, text, 'application/json');
    remember(name);
    return name;
  }
  let handle = pickNew ? null : await getHandle();
  if (handle) handle = await writable(handle);
  for (let tries = 0; tries < 2; tries++) {
    if (!handle) {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: '갈피-백업.json',
          types: [{ description: '갈피 백업', accept: { 'application/json': ['.json'] } }],
        });
      } catch (e) {
        if (e.name === 'AbortError') return null;
        throw e;
      }
      await setHandle(handle);
    }
    try {
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      remember(handle.name);
      return handle.name;
    } catch {
      handle = null; // 파일이 옮겨졌거나 지워졌으면 한 번 더 고르게
    }
  }
  throw new Error('백업 파일에 쓰지 못했어요.');
}
