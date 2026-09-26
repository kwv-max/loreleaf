// 작품 목록. 가장 먼저 보이는 건 "이어 쓰기" 하나.
import { h, icon, iconBtn, topbar, relTime, num, ask, actions, confirmBox, toast, download, josa, sheet } from '../ui.js';
import { db, worksSorted, chaptersOf, createWork, deleteWork, put, planImport, applyImport } from '../store.js';
import { go } from '../router.js';
import { emit } from '../guide.js';
import { manuscriptText, countOf, wordsOf } from '../quotes.js';
import { saveBackup, lastBackup, canOverwrite } from '../backup.js';
import { snapshot } from '../versions.js';
import { newVersion, showUpdate } from '../update.js';
import { todayCount } from '../today.js';
import { pref, setPref } from '../prefs.js';
import { t, lang } from '../i18n.js';

export async function newWork() {
  const title = await ask(t('lib.newWork'), { placeholder: t('lib.workTitle'), ok: t('lib.create') });
  if (!title) return;
  const w = createWork(title);
  emit('work-created', w.id);
  go('/w/' + w.id);
}

export function workMenu(w, { onDeleted } = {}) {
  actions([
    { label: t('lib.renameTitle'), run: async () => {
      const title = await ask(t('lib.workTitle'), { value: w.title });
      if (title) { w.title = title; put('works', w); go(location.hash.slice(1), { replace: true }); }
    } },
    { label: t('lib.exportText'), run: () => exportText(w) },
    { label: t('lib.deleteWork'), danger: true, run: async () => {
      const ok = await confirmBox(t('lib.deleteConfirm', { title: w.title }), { ok: t('common.delete'), danger: true });
      if (!ok) return;
      const restore = deleteWork(w.id);
      onDeleted?.();
      toast(t('lib.deleted'), {
        action: t('common.undo'), duration: 10000,
        onAction: () => { restore(); go('/', { replace: true }); toast(t('lib.restored')); },
      });
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
    const text = serialText(c, opts);
    info.textContent = t('unit.charsBoth', { all: num(text.length), noSpace: num(text.replace(/\s/g, '').length), words: num(wordsOf(text)) });
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
    toggle('gap', t('serial.gap'), t('serial.gapSub')),
    toggle('title', t('serial.title'), t('serial.titleSub', { title: c.title })),
    info,
    h('button', {
      class: 'btn primary',
      onclick: async () => {
        const ok = await copyText(serialText(c, opts));
        s.close();
        toast(ok ? t('serial.copied') : t('serial.copyFailed'));
      },
    }, t('serial.copy')),
    h('p', { class: 'muted small' }, t('serial.note'))),
  { title: t('serial.sheetTitle', { title: c.title }) });
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
      if (name) toast(canOverwrite() ? t('backup.savedTo', { name }) : t('backup.downloaded', { name }));
    } catch (e) { toast(e.message || t('backup.failed')); }
  };
  if (!canOverwrite() || !last) return [{ label: t('backup.save'), run: run(false) }];
  return [
    { label: t('backup.saveTo', { name: last.name, when: relTime(last.at) }), run: run(false) },
    { label: t('backup.saveOther'), run: run(true) },
  ];
}

function appMenu() {
  actions([
    { label: t('lib.prefs'), run: () => go('/prefs') },
    { label: t('lib.help'), run: () => go('/help') },
    ...backupItems(),
    { label: t('backup.load'), run: () => {
      const input = h('input', { type: 'file', accept: '.json,application/json' });
      input.onchange = async () => {
        let plan;
        try {
          let o;
          try { o = JSON.parse(await input.files[0].text()); } catch { throw new Error(t('backup.unreadable')); }
          plan = planImport(o);
        } catch (e) { toast(e.message || t('backup.loadFailed'), { duration: 6000 }); return; }
        importSheet(plan);
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
      h('div', { class: 'resume-label' }, t('lib.resume')),
      h('div', { class: 'resume-title' }, recent.title, h('span', { class: 'muted' }, ' · ' + c.title)),
      tail ? h('div', { class: 'resume-tail' }, '…' + tail) : h('div', { class: 'resume-tail muted' }, t('lib.emptyChapter')),
      todayLine()); // 오늘 쓴 양은 이어 쓰기 카드 안에 (카드가 없을 때만 따로)
  })();

  const list = works.length
    ? h('div', { class: 'list' }, works.map((w) => {
      const chs = chaptersOf(w.id);
      const chars = chs.reduce((n, c) => n + countOf(c), 0);
      return h('div', { class: 'row' },
        h('button', { class: 'row-main', onclick: () => go('/w/' + w.id) },
          h('div', { class: 'row-title' }, w.title, w.sample ? h('span', { class: 'badge' }, t('lib.sample')) : null),
          h('div', { class: 'row-sub' }, `${t('unit.chapters', { n: chs.length })} · ${t('unit.chars', { n: num(chars) })} · ${relTime(w.updatedAt)}`)),
        iconBtn('more', t('lib.workMenu'), () => workMenu(w, { onDeleted: () => go('/', { replace: true }) })));
    }))
    : h('div', { class: 'empty' },
      icon('leaf', 'big'),
      h('p', null, t('lib.none')),
      h('p', { class: 'muted' }, t('lib.noneSub')));

  return h('div', { class: 'screen' },
    topbar({ title: t('app.name'), right: [iconBtn('help', t('lib.help'), () => go('/help')), iconBtn('more', t('common.menu'), appMenu)] }),
    h('main', { class: 'content' },
      updateTip(),
      backupTip(),
      iosInstallTip(),
      resume || todayLine(),
      works.length ? h('h2', { class: 'section' }, t('lib.works')) : null,
      list),
    h('div', { class: 'bottom-bar' }, h('button', { class: 'btn primary', onclick: newWork }, icon('plus'), t('lib.newWork'))));
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
      h('b', null, t('ios.title')),
      h('p', null, t('ios.body'))),
    h('button', { class: 'icon-btn sm', 'aria-label': t('common.close'), onclick: () => { try { localStorage.setItem('ll:ios-tip', '1'); } catch {} el.remove(); } }, icon('close')));
  return el;
}

// 새 버전이 나왔으면 목록 맨 위에 조용히
function updateTip() {
  const v = newVersion();
  if (!v) return null;
  return h('button', { class: 'update-tip', onclick: showUpdate },
    h('div', null,
      h('b', null, t('update.tipTitle')),
      v.notes?.[0] ? h('p', null, v.notes[0] + (v.notes.length > 1 ? t('update.tipMore', { n: v.notes.length - 1 }) : '')) : null),
    h('span', { class: 'update-go' }, t('update.go')));
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
      h('b', null, last ? t('backup.tipDays', { days }) : t('backup.tipNever')),
      h('p', null, t('backup.tipBody'))),
    h('button', {
      class: 'update-go',
      onclick: async () => {
        try {
          const name = await saveBackup();
          if (!name) return;
          toast(canOverwrite() ? t('backup.savedTo', { name }) : t('backup.downloaded', { name }));
          el.remove();
        } catch (e) { toast(e.message || t('backup.failed')); }
      },
    }, t('backup.now')),
    h('button', {
      class: 'icon-btn sm', 'aria-label': t('backup.snooze'),
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
      goal ? h('span', null, done ? t('today.goalDone') : t('today.label'), ' ', h('b', null, num(n)), t('today.ofGoal', { goal: num(goal) }))
        : h('span', null, ...t('today.wrote', { n: h('b', null, num(n)) }))),
    goal ? h('div', { class: 'today-bar' }, h('span', { style: `width:${Math.min(100, (n / goal) * 100)}%` })) : null);
}

// 백업 불러오기: 무엇이 들어 있고 이 기기와 어떻게 다른지 보여 준 뒤, 합칠지 그대로 되돌릴지 고른다.
export function importSheet(plan) {
  const { n } = plan;
  const when = plan.exportedAt ? new Date(plan.exportedAt) : null;
  const run = async (mode) => {
    s.close();
    const done = await applyImport(plan, mode, (c) => snapshot(c));
    go('/', { replace: true });
    toast(done ? t('import.done', { n: done }) : t('import.noChange'));
  };
  const nothing = !n.new && !n.newer && !n.older;
  const s = sheet(h('div', { class: 'import-sheet' },
    h('p', null, h('b', null, t('import.works', { n: plan.works.length })), plan.works.length ? ` · ${plan.works.slice(0, 3).join(', ')}${plan.works.length > 3 ? t('import.more') : ''}` : ''),
    when ? h('p', { class: 'muted small' }, t('import.madeOn', { date: new Intl.DateTimeFormat(lang(), { dateStyle: 'long' }).format(when) })) : null,
    h('ul', { class: 'import-counts' },
      h('li', null, t('import.new'), h('b', null, n.new)),
      h('li', null, t('import.newer'), h('b', null, n.newer)),
      h('li', null, t('import.older'), h('b', null, n.older)),
      h('li', null, t('import.same'), h('b', null, n.same))),
    nothing ? h('p', { class: 'muted' }, t('import.nothing')) : [
      h('button', { class: 'btn primary', onclick: () => run('merge') }, t('import.merge')),
      h('p', { class: 'muted small' }, t('import.mergeNote')),
      n.older ? h('button', { class: 'btn ghost danger-text', onclick: () => run('replace') }, t('import.replace')) : null,
      n.older ? h('p', { class: 'muted small' }, t('import.replaceNote', { n: n.older })) : null,
    ]),
  { title: t('import.title') });
}
