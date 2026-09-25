// 화별 이전 버전. 글을 쓰는 동안 조용히 쌓아 두고, 오래될수록 듬성듬성 남긴다.
// 이 기기의 안전망이라 백업 파일에는 넣지 않는다 (백업이 커지지 않게).
//   version = { id, workId, chapterId, text, quotes, notes, at, len }
import { rawDB, uid } from './store.js';
import { lengthOf } from './quotes.js';

const S = 'versions';
const H = 3600 * 1000, D = 24 * H;
// 기간마다 따로 몇 개까지: 최근 것이 많아도 오래된 버전이 밀려나지 않게 (한 화에 최대 74개, 넉 달쯤)
const QUOTA = { a: 10, h: 24, d: 24, w: 16 };

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

// 새것부터
export async function versionsOf(cid) {
  const list = (await run('readonly', (s) => s.index('chapterId').getAll(IDBKeyRange.only(cid)))) || [];
  return list.sort((a, b) => b.at - a.at);
}

const same = (a, b) => a.text === b.text && JSON.stringify(a.quotes || {}) === JSON.stringify(b.quotes || {});

// 지금 상태를 남긴다. 바로 앞 버전과 같거나, 처음부터 빈 화면 남기지 않는다.
// 거의 동시에 불려도(앱 내림 + 화면 떠남) 겹쳐 쌓이지 않게 차례로 처리한다.
let chain = Promise.resolve();
export function snapshot(ch) {
  const copy = { id: ch.id, workId: ch.workId, text: ch.text, quotes: ch.quotes, notes: ch.notes };
  const p = chain.then(() => doSnapshot(copy));
  chain = p.catch(() => null);
  return p;
}
async function doSnapshot(ch) {
  const list = await versionsOf(ch.id);
  if (list[0] && same(list[0], ch)) return null;
  if (!list.length && !ch.text.trim()) return null;
  const v = {
    id: uid(), workId: ch.workId, chapterId: ch.id,
    text: ch.text, quotes: { ...(ch.quotes || {}) }, notes: (ch.notes || []).map((n) => ({ ...n })),
    at: Date.now(), len: lengthOf(ch),
  };
  await run('readwrite', (s) => s.put(v));
  await prune([v, ...list]);
  return v;
}

// 최근 2시간은 전부, 일주일까지는 한 시간에 하나, 한 달까지는 하루에 하나, 그 뒤로는 일주일에 하나
function bucket(at, now) {
  const age = now - at;
  if (age < 2 * H) return 'a' + at;
  if (age < 7 * D) return 'h' + Math.floor(at / H);
  if (age < 30 * D) return 'd' + Math.floor(at / D);
  return 'w' + Math.floor(at / (7 * D));
}
async function prune(list) {
  const now = Date.now();
  const seen = new Set();
  const used = { a: 0, h: 0, d: 0, w: 0 };
  const drop = [];
  for (const v of list) { // 새것부터: 칸마다 가장 새것만, 기간마다 정해진 개수까지
    const b = bucket(v.at, now);
    const tier = b[0];
    if (seen.has(b) || used[tier] >= QUOTA[tier]) { drop.push(v.id); continue; }
    seen.add(b);
    used[tier]++;
  }
  if (drop.length) await run('readwrite', (s) => { for (const id of drop) s.delete(id); });
}

// "오늘 23:10", "어제 08:02", "9월 21일 14:00"
export function whenLabel(at) {
  const d = new Date(at), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / D);
  if (diff === 0) return `오늘 ${hm}`;
  if (diff === 1) return `어제 ${hm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}
