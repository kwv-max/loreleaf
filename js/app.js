import { h, icon, toast } from './ui.js';
import { initStore, db, uid, setWriteErrorHandler } from './store.js';
import { saveBackup } from './backup.js';
import { t } from './i18n.js';
import { route, render, onRender, go, seedHistory, path } from './router.js';
import { decorate, startGuide } from './guide.js';
import { insertSample } from './sample.js';
import { libraryScreen } from './screens/library.js';
import { manuscriptScreen, loreScreen } from './screens/work.js';
import { categoryScreen } from './screens/lore.js';
import { entryScreen } from './screens/entry.js';
import { editorScreen } from './screens/editor.js';
import { helpScreen } from './screens/help.js';
import { prefsScreen } from './screens/prefs.js';
import { searchScreen } from './screens/search.js';
import { graphScreen } from './screens/graph.js';
import { initUpdates, onUpdate, versionReady } from './update.js';

route('/', libraryScreen);
route('/help', helpScreen);
route('/prefs', prefsScreen);
route('/w/:wid', manuscriptScreen);
route('/w/:wid/lore', loreScreen);
route('/w/:wid/search', searchScreen);
route('/w/:wid/graph', graphScreen);
route('/w/:wid/graph/:eid', graphScreen);
route('/w/:wid/lore/:type', categoryScreen);
route('/w/:wid/lore/:type/:fid', categoryScreen);
route('/w/:wid/c/:cid', editorScreen);
route('/w/:wid/e/:eid', entryScreen);

const LAST = 'll:last';
onRender((p) => {
  try { localStorage.setItem(LAST, p); } catch {}
  decorate();
});

function welcome() {
  const close = () => { try { localStorage.setItem('ll:welcomed', '1'); } catch {} el.remove(); };
  const sampleId = [...db.works.values()].find((w) => w.sample)?.id;
  const el = h('div', { class: 'welcome' },
    h('div', { class: 'welcome-inner' },
      icon('leaf', 'welcome-leaf'),
      h('h1', null, t('app.name')),
      h('p', { class: 'welcome-lead' }, t('welcome.lead')),
      h('p', { class: 'muted' }, t('welcome.body')),
      h('div', { class: 'welcome-actions' },
        h('button', { class: 'btn primary', onclick: () => { close(); startGuide(); go('/', { replace: true }); } }, t('welcome.try')),
        sampleId ? h('button', { class: 'btn ghost', onclick: () => { close(); go('/w/' + sampleId); } }, t('welcome.sample')) : null,
        h('button', { class: 'link-btn center', onclick: close }, t('welcome.skip')))));
  document.body.append(el);
}

// 저장이 실패하면(저장 공간 부족 등) 알린다. 너무 자주 뜨지 않게 20초에 한 번.
let lastWriteError = 0;
setWriteErrorHandler(() => {
  if (Date.now() - lastWriteError < 20000) return;
  lastWriteError = Date.now();
  toast(t('app.writeFailed'), {
    action: t('app.backupAction'), duration: 12000,
    onAction: () => saveBackup().then((n) => n && toast(t('backup.savedTo', { name: n }))).catch(() => toast(t('backup.failed'))),
  });
});

// 갈피가 두 창(설치한 앱 + 브라우저 탭 등)에 열려 있으면 같은 글을 서로 덮어쓸 수 있다.
// 마지막에 연 창 하나만 쓰고, 나머지 창은 쓰던 것을 저장한 뒤 쉰다. '여기서 계속 쓰기'를 누르면 그 창이 쓰는 창이 된다.
// 새 창은 먼저 "연다"고 알린다. 다른 창이 있으면 바로 "여기 있어"라고 답하고, 저장을 마치면 "저장했어"를 보낸다.
// 새 창은 답이 없으면 바로(0.08초), 있으면 저장이 끝날 때까지(최대 0.6초) 기다린 뒤 글을 읽는다.
function guardSingleWindow() {
  if (!('BroadcastChannel' in window)) return Promise.resolve();
  const ch = new BroadcastChannel('loreleaf-window');
  const me = uid();
  let settle, someone = false;
  const ready = new Promise((r) => {
    settle = r;
    setTimeout(() => { if (!someone) r(); }, 80);
    setTimeout(r, 600);
  });
  ch.onmessage = (ev) => {
    if (ev.data?.to === me) { if (ev.data.t === 'here') someone = true; else if (ev.data.t === 'saved') settle(); return; }
    if (ev.data?.t !== 'hello' || ev.data.me === me) return;
    ch.postMessage({ t: 'here', to: ev.data.me });
    if (document.querySelector('.paused')) { ch.postMessage({ t: 'saved', to: ev.data.me }); return; }
    window.dispatchEvent(new Event('ll-flush')); // 에디터는 바로 저장
    render(); // 지금 화면을 정리하면서(떠날 때 저장) 다시 그린다
    setTimeout(() => ch.postMessage({ t: 'saved', to: ev.data.me }), 120); // 저장이 끝날 즈음 새 창에 알림
    const el = h('div', { class: 'paused' },
      h('div', { class: 'paused-inner' },
        icon('leaf', 'welcome-leaf'),
        h('h2', null, t('app.pausedTitle')),
        h('p', { class: 'muted' }, t('app.pausedBody')),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, t('app.pausedResume'))));
    document.body.append(el);
  };
  ch.postMessage({ t: 'hello', me });
  return ready;
}

async function boot() {
  await guardSingleWindow(); // 다른 창이 쓰던 걸 저장한 뒤에 읽는다
  const ok = await initStore({
    blocked: () => toast(t('app.blocked'), { duration: 60000 }),
  });
  let first = false;
  try { first = !localStorage.getItem('ll:welcomed'); } catch {}
  if (first && !db.works.size) insertSample();

  // 앱을 다시 열면 마지막으로 보던 곳으로. 뒤로 가기가 앱을 끄지 않고 상위 화면으로 가도록 길도 깔아 둔다.
  // 주소에 화면이 이미 있으면(새로고침 등) 그 화면, 없으면 마지막으로 보던 화면.
  let target = location.hash ? path() : null;
  if (!target) { try { target = localStorage.getItem(LAST); } catch {} }
  if (target && target !== '/') seedHistory(target);
  // 새 버전 확인. 작품 목록을 보고 있으면 안내가 바로 보이게 다시 그린다.
  initUpdates();
  onUpdate(() => { if (path() === '/') render(); });
  freshStyles();
  render();
  if (first) welcome();
  if (!ok) toast(t('app.noStorage'), { duration: 6000 });

  // 브라우저가 공간이 모자랄 때 글을 지우지 않도록 (특히 아이폰 사파리)
  navigator.storage?.persist?.().catch(() => {});

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();

// 배포 직후에는 호스팅 캐시가 파일마다 따로 바뀌어서, 새 스크립트에 옛 스타일 파일이 섞일 수 있다 (새 화면이 깨져 보임).
// 켜질 때의 버전 번호를 붙인 주소로 스타일을 한 번 더 받아, 다 받으면 바꿔 끼운다 (오프라인이면 그대로).
function freshStyles() {
  versionReady().then((v) => {
    const old = document.querySelector('link[rel="stylesheet"][href="css/app.css"]');
    if (!v || !old) return;
    const link = h('link', { rel: 'stylesheet', href: `css/app.css?v=${encodeURIComponent(v)}` });
    link.onload = () => old.remove();
    link.onerror = () => link.remove();
    old.after(link);
  });
}
