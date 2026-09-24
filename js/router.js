// 해시 라우터. 화면 함수는 DOM 요소를 돌려주고, 필요하면 el.cleanup을 달아둔다.
const routes = [];
let current = null;
let afterRender = () => {};

export function route(pattern, fn) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, fn });
}

export const path = () => decodeURI(location.hash.slice(1)) || '/';

export function go(p, { replace = false } = {}) {
  if (replace) history.replaceState(history.state, '', '#' + p);
  else history.pushState({ inApp: true }, '', '#' + p);
  render();
}

// 앱 안에서 이동해 왔으면 브라우저 뒤로, 아니면(재실행 직후 등) 논리적인 상위 화면으로.
export function back(fallback) {
  if (history.state?.inApp) history.back();
  else go(fallback, { replace: true });
}

export function onRender(fn) { afterRender = fn; }

export function render() {
  const p = path();
  const prev = current;
  current = null;
  prev?.cleanup?.();
  document.getElementById('layer').replaceChildren();
  for (const r of routes) {
    const m = p.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
    const el = r.fn(params);
    if (!el) return; // 화면 함수가 다른 곳으로 보냈음
    current = el;
    document.getElementById('app').replaceChildren(el);
    if (!el.keepScroll) window.scrollTo(0, 0);
    afterRender(p, el);
    return;
  }
  go('/', { replace: true });
}

window.addEventListener('popstate', render);
