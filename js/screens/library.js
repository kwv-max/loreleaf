// 작품 목록. 가장 먼저 보이는 건 "이어 쓰기" 하나.
import { h, icon, iconBtn, topbar, relTime, num, ask, actions, confirmBox, toast, download, josa } from '../ui.js';
import { db, worksSorted, chaptersOf, createWork, deleteWork, put, exportAll, importAll } from '../store.js';
import { go } from '../router.js';
import { emit } from '../guide.js';
import { normalizeQuotes } from '../quotes.js';

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

// 원고만 깨끗하게. 형광펜 같은 표시는 애초에 원고에 없다. 따옴표는 환경 설정의 모양으로 통일.
export function exportText(w) {
  const body = chaptersOf(w.id).map((c) => `${c.title}\n\n${normalizeQuotes(c.text.trim())}`).join('\n\n\n');
  download(`${w.title}.txt`, `${w.title}\n\n\n${body}\n`);
}

function appMenu() {
  actions([
    { label: '환경 설정', run: () => go('/prefs') },
    { label: '도움말', run: () => go('/help') },
    { label: '백업 파일 저장', run: () => {
      const d = new Date();
      download(`갈피-백업-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`,
        JSON.stringify(exportAll()), 'application/json');
    } },
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
      const chars = chs.reduce((n, c) => n + c.text.length, 0);
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
      resume,
      works.length ? h('h2', { class: 'section' }, '작품') : null,
      list),
    h('div', { class: 'bottom-bar' }, h('button', { class: 'btn primary', onclick: newWork }, icon('plus'), '새 작품')));
}
