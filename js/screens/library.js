// 작품 목록. 가장 먼저 보이는 건 "이어 쓰기" 하나.
import { h, icon, iconBtn, topbar, relTime, num, ask, actions, confirmBox, toast, download, josa } from '../ui.js';
import { db, worksSorted, chaptersOf, createWork, deleteWork, put, importAll } from '../store.js';
import { go } from '../router.js';
import { emit } from '../guide.js';
import { manuscriptText, lengthOf } from '../quotes.js';
import { saveBackup, lastBackup, canOverwrite } from '../backup.js';

export async function newWork() {
  const title = await ask('새 작품', { placeholder: '작품 제목', ok: '만들기' });
  if (!title) return;
  const w = createWork(title);
  emit('work-created', w.id);
  go('/w/' + w.id);
}

export function workMenu(w, { onDeleted } = {}) {
  actions([
    { label: '제목 바꾸기', run: async () => {
      const t = await ask('작품 제목', { value: w.title });
      if (t) { w.title = t; put('works', w); go(location.hash.slice(1), { replace: true }); }
    } },
    { label: '원고를 텍스트 파일로 내보내기', run: () => exportText(w) },
    { label: '작품 삭제', danger: true, run: async () => {
      const ok = await confirmBox(`‘${w.title}’${josa(w.title, '을', '를')} 지울까요? 원고와 설정이 모두 사라지고 되돌릴 수 없어요.`, { ok: '삭제', danger: true });
      if (ok) { deleteWork(w.id); toast('작품을 지웠어요.'); onDeleted?.(); }
    } },
  ], w.title);
}

// 원고만 깨끗하게. 형광펜은 애초에 원고에 없고, 대사 줄에는 환경 설정의 모양으로 따옴표가 붙는다.
export function exportChapter(w, c) {
  download(`${w.title} - ${c.title}.txt`, `${c.title}\n\n${manuscriptText(c).trim()}\n`);
}

export function exportText(w) {
  const body = chaptersOf(w.id).map((c) => `${c.title}\n\n${manuscriptText(c).trim()}`).join('\n\n\n');
  download(`${w.title}.txt`, `${w.title}\n\n\n${body}\n`);
}

// 백업: 한 번 고른 파일에 덮어쓴다. 어디에 언제 저장했는지 메뉴에 보여 준다.
function backupItems() {
  const last = lastBackup();
  const run = (pickNew) => async () => {
    try {
      const name = await saveBackup({ pickNew });
      if (name) toast(canOverwrite() ? `‘${name}’에 백업했어요.` : `‘${name}’로 내려받았어요.`);
    } catch (e) { toast(e.message || '백업하지 못했어요.'); }
  };
  if (!canOverwrite() || !last) return [{ label: '백업 파일 저장', run: run(false) }];
  return [
    { label: `백업 저장 · ${last.name} (${relTime(last.at)})`, run: run(false) },
    { label: '다른 파일에 백업', run: run(true) },
  ];
}

function appMenu() {
  actions([
    { label: '환경 설정', run: () => go('/prefs') },
    { label: '도움말', run: () => go('/help') },
    ...backupItems(),
    { label: '백업 파일 불러오기', run: () => {
      const input = h('input', { type: 'file', accept: '.json,application/json' });
      input.onchange = async () => {
        try {
          await importAll(JSON.parse(await input.files[0].text()));
          toast('백업을 불러왔어요.');
          go('/', { replace: true });
        } catch (e) { toast(e.message || '불러오지 못했어요.'); }
      };
      input.click();
    } },
  ]);
}

export function libraryScreen() {
  const works = worksSorted();
  const recent = works.find((w) => w.lastChapterId && db.chapters.get(w.lastChapterId));

  const resume = recent && (() => {
    const c = db.chapters.get(recent.lastChapterId);
    const tail = c.text.trim().slice(-80).replace(/\s+/g, ' ');
    return h('button', { class: 'resume', onclick: () => go(`/w/${recent.id}/c/${c.id}`) },
      h('div', { class: 'resume-label' }, '이어 쓰기'),
      h('div', { class: 'resume-title' }, recent.title, h('span', { class: 'muted' }, ' · ' + c.title)),
      tail ? h('div', { class: 'resume-tail' }, '…' + tail) : h('div', { class: 'resume-tail muted' }, '아직 비어 있어요'));
  })();

  const list = works.length
    ? h('div', { class: 'list' }, works.map((w) => {
      const chs = chaptersOf(w.id);
      const chars = chs.reduce((n, c) => n + lengthOf(c), 0);
      return h('div', { class: 'row' },
        h('button', { class: 'row-main', onclick: () => go('/w/' + w.id) },
          h('div', { class: 'row-title' }, w.title, w.sample ? h('span', { class: 'badge' }, '샘플') : null),
          h('div', { class: 'row-sub' }, `${chs.length}화 · ${num(chars)}자 · ${relTime(w.updatedAt)}`)),
        iconBtn('more', '작품 메뉴', () => workMenu(w, { onDeleted: () => go('/', { replace: true }) })));
    }))
    : h('div', { class: 'empty' },
      icon('leaf', 'big'),
      h('p', null, '아직 작품이 없어요.'),
      h('p', { class: 'muted' }, '제목 하나면 바로 시작할 수 있어요.'));

  return h('div', { class: 'screen' },
    topbar({ title: '갈피', right: [iconBtn('help', '도움말', () => go('/help')), iconBtn('more', '메뉴', appMenu)] }),
    h('main', { class: 'content' },
      iosInstallTip(),
      resume,
      works.length ? h('h2', { class: 'section' }, '작품') : null,
      list),
    h('div', { class: 'bottom-bar' }, h('button', { class: 'btn primary', onclick: newWork }, icon('plus'), '새 작품')));
}

// 아이폰 사파리에서는 설치 버튼이 따로 뜨지 않는다. 홈 화면에 추가하는 법을 한 번 알려 준다.
// 홈 화면에 추가해야 앱처럼 열리고, 사파리가 오래 안 쓴 사이트의 저장 공간을 비울 때도 글이 안전하다.
function iosInstallTip() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let seen = false;
  try { seen = !!localStorage.getItem('ll:ios-tip'); } catch {}
  if (!ios || navigator.standalone || seen) return null;
  const el = h('div', { class: 'ios-tip' },
    h('div', null,
      h('b', null, '홈 화면에 추가해 주세요'),
      h('p', null, '아래 공유 버튼 → ‘홈 화면에 추가’를 누르면 앱처럼 열려요. 사파리에서만 쓰면, 오래 안 열었을 때 글이 지워질 수 있어요.')),
    h('button', { class: 'icon-btn sm', 'aria-label': '닫기', onclick: () => { try { localStorage.setItem('ll:ios-tip', '1'); } catch {} el.remove(); } }, icon('close')));
  return el;
}
