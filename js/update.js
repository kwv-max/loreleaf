// 업데이트 확인. version.json(배포할 때마다 올리는 번호와 바뀐 점)을 가끔 확인해서,
// 지금 돌고 있는 것과 다르면 알려 준다. 업데이트는 새로고침 한 번 (서비스 워커가 새 파일을 받아 온다).
import { h, sheet, toast } from './ui.js';
import { path } from './router.js';

let loaded = null; // 앱이 켜질 때의 버전
let latest = null; // 새로 나온 버전 (없으면 null)
const listeners = new Set();

async function fetchVersion() {
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export const currentVersion = () => loaded?.version || null;
// 켜질 때의 버전 확인이 끝나면 (화면이 먼저 그려져도 나중에 채울 수 있게)
let firstCheck = null;
export const versionReady = () => (firstCheck || Promise.resolve()).then(currentVersion);
export const newVersion = () => latest;
export function onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// 새 버전이 있으면 그 정보를, 없으면 null
export async function checkUpdate() {
  const v = await fetchVersion();
  if (!v) return latest;
  if (!loaded) { loaded = v; return null; }
  if (v.version !== loaded.version && v.version !== latest?.version) {
    latest = v;
    for (const fn of listeners) fn(v);
    // 글 쓰는 중에는 방해하지 않고, 다른 화면에서만 짧게 알린다 (작품 목록에는 따로 안내가 남는다)
    if (!/\/c\//.test(path())) toast('갈피 새 버전이 있어요.', { action: '업데이트', onAction: showUpdate, duration: 8000 });
  }
  return latest;
}

// 바뀐 점을 보여 주고 업데이트 (새로고침). 쓰던 글은 떠날 때 저장되고, 임시 저장본도 남아 있다.
export function showUpdate() {
  if (!latest) return;
  document.querySelector('.toast')?.remove(); // 알림 토스트가 시트를 가리지 않게
  const s = sheet(h('div', { class: 'update-sheet' },
    latest.notes?.length ? h('ul', { class: 'update-notes' }, latest.notes.map((n) => h('li', null, n))) : null,
    h('button', { class: 'btn primary', onclick: () => { s.close(); applyUpdate(); } }, '지금 업데이트'),
    h('p', { class: 'muted small center' }, '쓰던 글은 그대로 남아요.')),
  { title: `새 버전 ${latest.version}` });
}

export function applyUpdate() {
  // 떠날 때 저장(pagehide)이 돌고 나서 새 파일로 다시 연다
  setTimeout(() => location.reload(), 50);
}

export function initUpdates() {
  firstCheck = checkUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
  setInterval(checkUpdate, 30 * 60 * 1000);
}
