import { h, icon, toast } from './ui.js';
import { initStore, db } from './store.js';
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
import { initUpdates, onUpdate } from './update.js';

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
      h('h1', null, '갈피'),
      h('p', { class: 'welcome-lead' }, '쓰는 건 당신이, 기억하는 건 갈피가.'),
      h('p', { class: 'muted' }, '등장인물을 등록해 두면, 본문에 이름이 나올 때마다 알아서 표시하고 설정을 바로 보여줘요.'),
      h('div', { class: 'welcome-actions' },
        h('button', { class: 'btn primary', onclick: () => { close(); startGuide(); go('/', { replace: true }); } }, '1분 만에 해보기'),
        sampleId ? h('button', { class: 'btn ghost', onclick: () => { close(); go('/w/' + sampleId); } }, '샘플 작품 구경하기') : null,
        h('button', { class: 'link-btn center', onclick: close }, '바로 시작할게요'))));
  document.body.append(el);
}

async function boot() {
  const ok = await initStore({
    blocked: () => toast('다른 창에 열려 있는 갈피를 닫아 주세요. 새 버전으로 바꾸는 중이에요.', { duration: 60000 }),
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
  render();
  if (first) welcome();
  if (!ok) toast('이 브라우저에서는 저장이 되지 않을 수 있어요. (사생활 보호 모드?)', { duration: 6000 });

  // 브라우저가 공간이 모자랄 때 글을 지우지 않도록 (특히 아이폰 사파리)
  navigator.storage?.persist?.().catch(() => {});

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
