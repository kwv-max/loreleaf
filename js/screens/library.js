// 작품 목록. 가장 먼저 보이는 건 "이어 쓰기" 하나.
import { h, icon, iconBtn, topbar, relTime, num, ask, actions, confirmBox, toast, download, josa, sheet } from '../ui.js';
import { db, worksSorted, chaptersOf, createWork, deleteWork, put, importAll } from '../store.js';
import { go } from '../router.js';
import { emit } from '../guide.js';
import { manuscriptText, lengthOf } from '../quotes.js';
import { saveBackup, lastBackup, canOverwrite } from '../backup.js';
import { newVersion, showUpdate } from '../update.js';
import { todayCount } from '../today.js';
import { pref, setPref } from '../prefs.js';

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

// ---- 연재용 복사 ----
// 연재 사이트 입력 칸에 붙여 넣기 좋게: 문단 사이 빈 줄(여러 사이트가 줄바꿈 하나를 무시한다), 제목은 골라서.
export function serialText(c, { gap = true, title = false } = {}) {
  const lines = manuscriptText(c).split('\n').map((l) => l.replace(/\s+$/, ''));
  const body = gap
    ? lines.filter((l) => l.trim()).join('\n\n')
    : lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return (title ? `${c.title}\n\n` : '') + body.trim();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  // 예전 방식 (권한이 없을 때)
  const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}
export function serialCopy(c) {
  const opts = { gap: pref('serialGap'), title: pref('serialTitle') };
  const info = h('p', { class: 'muted small' });
  const drawInfo = () => {
    const t = serialText(c, opts);
    info.textContent = `공백 포함 ${num(t.length)}자 · 공백 제외 ${num(t.replace(/\s/g, '').length)}자`;
  };
  const toggle = (key, label, sub) => {
    const b = h('button', { class: 'toggle-row', type: 'button', role: 'switch' },
      h('span', null, h('b', null, label), h('span', { class: 'muted small' }, sub)),
      h('span', { class: 'switch' }));
    const sync = () => { b.classList.toggle('on', !!opts[key]); b.setAttribute('aria-checked', String(!!opts[key])); };
    b.addEventListener('click', () => { opts[key] = !opts[key]; setPref(key === 'gap' ? 'serialGap' : 'serialTitle', opts[key]); sync(); drawInfo(); });
    sync();
    return b;
  };
  drawInfo();
  const s = sheet(h('div', { class: 'serial-sheet' },
    toggle('gap', '문단 사이에 빈 줄', '줄바꿈 하나를 무시하는 사이트에 좋아요'),
    toggle('title', '제목 넣기', `맨 위에 ‘${c.title}’`),
    info,
    h('button', {
      class: 'btn primary',
      onclick: async () => {
        const ok = await copyText(serialText(c, opts));
        s.close();
        toast(ok ? '복사했어요. 연재 사이트에 붙여 넣으면 돼요.' : '복사하지 못했어요. 텍스트로 내보내기를 써 주세요.');
      },
    }, '복사하기'),
    h('p', { class: 'muted small' }, '주석은 빠지고, 대사 줄에는 환경 설정의 따옴표가 붙어요.')),
  { title: `${c.title} · 연재용 복사` });
}

export function exportText(w) {
  // 부가 시작되는 화 앞에는 부 제목을 넣는다
  const body = chaptersOf(w.id).map((c) => `${c.part ? `【${c.part}】\n\n\n` : ''}${c.title}\n\n${manuscriptText(c).trim()}`).join('\n\n\n');
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
      updateTip(),
      backupTip(),
      iosInstallTip(),
      resume,
      todayLine(),
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

// 새 버전이 나왔으면 목록 맨 위에 조용히
function updateTip() {
  const v = newVersion();
  if (!v) return null;
  return h('button', { class: 'update-tip', onclick: showUpdate },
    h('div', null,
      h('b', null, '새 버전이 있어요'),
      v.notes?.[0] ? h('p', null, v.notes[0] + (v.notes.length > 1 ? ` 외 ${v.notes.length - 1}가지` : '')) : null),
    h('span', { class: 'update-go' }, '업데이트'));
}

// 백업 알림: 마지막 백업 뒤로 글이 바뀌었고 7일이 지났을 때 (한 번도 안 했으면 글이 좀 쌓였을 때만).
// 누르면 정해 둔 파일에 바로 덮어쓴다. 닫으면 사흘 동안 조용히.
const DAY = 24 * 3600 * 1000;
function backupTip() {
  let snooze = 0;
  try { snooze = +localStorage.getItem('ll:backup-snooze') || 0; } catch {}
  if (Date.now() < snooze) return null;
  const mine = [...db.works.values()].filter((w) => !w.sample);
  if (!mine.length) return null;
  const last = lastBackup();
  const changed = Math.max(...mine.map((w) => w.updatedAt || 0));
  if (last) {
    if (changed <= last.at || Date.now() - last.at < 7 * DAY) return null;
  } else {
    const ids = new Set(mine.map((w) => w.id));
    const chars = [...db.chapters.values()].reduce((n, c) => n + (ids.has(c.workId) ? c.text.length : 0), 0);
    if (chars < 1000) return null;
  }
  const days = last ? Math.floor((Date.now() - last.at) / DAY) : 0;
  const el = h('div', { class: 'backup-tip' },
    icon('note', 'type-ic'),
    h('div', null,
      h('b', null, last ? `마지막 백업 ${days}일 전` : '아직 백업한 적이 없어요'),
      h('p', null, '글은 이 기기에만 있어요. 가끔 파일로 남겨 두면 안심이에요.')),
    h('button', {
      class: 'update-go',
      onclick: async () => {
        try {
          const name = await saveBackup();
          if (!name) return;
          toast(canOverwrite() ? `‘${name}’에 백업했어요.` : `‘${name}’로 내려받았어요.`);
          el.remove();
        } catch (e) { toast(e.message || '백업하지 못했어요.'); }
      },
    }, '지금 백업'),
    h('button', {
      class: 'icon-btn sm', 'aria-label': '사흘 동안 숨기기',
      onclick: () => { try { localStorage.setItem('ll:backup-snooze', String(Date.now() + 3 * DAY)); } catch {} el.remove(); },
    }, icon('close')));
  return el;
}

// 오늘 쓴 글자 수. 목표를 정해 둔 사람에게만 막대를 보여 준다.
function todayLine() {
  const n = todayCount();
  const goal = +pref('goal') || 0;
  if (!n && !goal) return null;
  const done = goal && n >= goal;
  return h('div', { class: 'today' + (done ? ' done' : '') },
    h('div', { class: 'today-text' },
      goal ? h('span', null, done ? '오늘 목표를 채웠어요' : '오늘', ' ', h('b', null, num(n)), ` / ${num(goal)}자`)
        : h('span', null, '오늘 ', h('b', null, num(n)), '자 썼어요')),
    goal ? h('div', { class: 'today-bar' }, h('span', { style: `width:${Math.min(100, (n / goal) * 100)}%` })) : null);
}
