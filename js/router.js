// 해시 라우터. 화면 함수는 DOM 요소를 돌려주고, 필요하면 el.cleanup을 달아둔다.
//
// 안드로이드 뒤로 가기:
//   떠 있는 것(시트·카드·찾기 막대)이 있으면 그것부터 닫고, 없으면 앱 안에서 이전 화면으로 간다.
//   첫 화면(작품 목록)에서만 앱을 닫는다.
//
// 크롬은 사용자가 직접 누르지 않고 만든 방문 기록(pushState)을 뒤로 가기에서 건너뛰기 때문에,
// 브라우저 기록 대신 CloseWatcher(안드로이드 뒤로 가기를 직접 받는 API)와 앱 안의 화면 스택을 쓴다.
// CloseWatcher가 없는 브라우저에서는 예전처럼 방문 기록을 쓴다.
const routes = [];
let current = null;
let shown = '/';
let afterRender = () => {};
const overlays = []; // 뒤로 가기로 닫을 것들 (마지막에 뜬 것부터)
const modern = 'CloseWatcher' in window;
let stack = ['/']; // 앱 안의 화면 기록 (modern일 때)

export function route(pattern, fn) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, fn });
}

export const path = () => decodeURI(location.hash.slice(1)) || '/';

export function go(p, { replace = false } = {}) {
  if (modern) {
    if (replace) stack[stack.length - 1] = p;
    else stack.push(p);
    history.replaceState(null, '', '#' + p);
  } else if (replace) history.replaceState(history.state, '', '#' + p);
  else history.pushState({ inApp: true }, '', '#' + p);
  render();
}

// 화면 위쪽 ‹ 버튼: 이전 화면이 있으면 그리로, 없으면(앱을 다시 연 직후 등) 논리적인 상위 화면으로.
export function back(fallback) {
  if (modern) {
    if (stack.length > 1) { stack.pop(); go(stack.pop()); }
    else go(fallback, { replace: true });
  } else if (history.state?.inApp) history.back();
  else go(fallback, { replace: true });
}

// 화면의 논리적인 상위. 앱을 다시 열어 깊은 화면이 복구됐을 때 뒤로 갈 길을 만들어 둔다.
export function parentOf(p) {
  const s = p.split('/').filter(Boolean); // ['w', 작품, 종류, ...]
  if (s[0] !== 'w' || s.length <= 2) return '/';
  const w = `/w/${s[1]}`;
  if (s[2] === 'lore' && s.length === 5) return `${w}/lore/${s[3]}`;
  if ((s[2] === 'lore' && s.length === 4) || s[2] === 'e' || s[2] === 'graph') return `${w}/lore`;
  return w;
}
export function seedHistory(p) {
  const chain = [];
  for (let q = p; q !== '/'; q = parentOf(q)) chain.unshift(q);
  if (modern) {
    stack = ['/', ...chain];
    history.replaceState(null, '', '#' + p);
    return;
  }
  history.replaceState(null, '', '#/');
  for (const q of chain) history.pushState({ inApp: true }, '', '#' + q);
}

// 떠 있는 것(시트, 카드, 찾기 막대)을 뒤로 가기에 등록. 돌려받은 함수로 등록을 푼다.
export function interceptBack(close) {
  overlays.push(close);
  armBack();
  return () => {
    const i = overlays.indexOf(close);
    if (i >= 0) { overlays.splice(i, 1); armBack(); }
  };
}

// ---- 뒤로 가기 받기 (modern) ----
// 한 번에 하나의 CloseWatcher만 둔다. 뒤로 가기가 오면 할 일을 하고 다시 건다.
// 첫 화면에 아무것도 떠 있지 않으면 걸지 않아서, 뒤로 가기가 앱을 닫는다.
let watcher = null;
function armBack() {
  if (!modern) return;
  watcher?.destroy();
  watcher = null;
  if (!overlays.length && stack.length <= 1) return;
  watcher = new CloseWatcher();
  watcher.onclose = () => {
    watcher = null;
    const close = overlays.pop();
    if (close) { close(); armBack(); return; }
    if (stack.length > 1) { stack.pop(); go(stack.pop()); }
  };
}

export function onRender(fn) { afterRender = fn; }

export function render() {
  const p = path();
  const prev = current;
  current = null;
  prev?.cleanup?.();
  overlays.length = 0;
  document.getElementById('layer').replaceChildren();
  for (const r of routes) {
    const m = p.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
    const el = r.fn(params);
    if (!el) return; // 화면 함수가 다른 곳으로 보냈음
    current = el;
    shown = p;
    document.getElementById('app').replaceChildren(el);
    if (!el.keepScroll) window.scrollTo(0, 0);
    afterRender(p, el);
    armBack();
    return;
  }
  go('/', { replace: true });
}

// 주소가 밖에서 바뀌면(직접 입력 등) 새 화면으로 친다.
window.addEventListener('hashchange', () => {
  if (!modern || path() === shown) return;
  stack.push(path());
  render();
});

// 예전 방식(CloseWatcher 없음): 방문 기록으로 뒤로 가기
window.addEventListener('popstate', () => {
  if (modern) return;
  const close = overlays.pop();
  if (close) {
    // 뒤로 가기가 이미 주소를 바꿨으니 되돌려 놓고, 떠 있던 것만 닫는다.
    history.pushState({ inApp: true }, '', '#' + shown);
    close();
    return;
  }
  render();
});
