// 설정 한 장 (캐릭터, 장소 등). 양식을 채우는 느낌이 아니라 메모장에 적는 느낌으로.
// 적는 즉시 저장되고, 이름을 비운 채 나가면 조용히 사라진다.
import { h, icon, iconBtn, topbar, debounce, autogrow, actions, toast, hintOnce, josa } from '../ui.js';
import { db, put, del, typeOf, uid, COLORS, foldersOf } from '../store.js';
import { appearances } from '../highlight.js';
import { go, back } from '../router.js';
import { emit } from '../guide.js';
import { setJump } from './editor.js';
import { moveToFolder } from './lore.js';

export function entryScreen({ wid, eid }) {
  const e = db.entries.get(eid);
  if (!e || e.workId !== wid) { go(`/w/${wid}/lore`, { replace: true }); return null; }
  const t = typeOf(e.type);
  const isChar = e.type === 'character';
  const listPath = `/w/${wid}/lore/${e.type}` + (e.folderId ? '/' + e.folderId : '');
  const save = debounce(() => put('entries', e), 400);
  const checkGuide = () => { if (e.name.trim() && e.aliases.length) emit('alias-added'); };

  // ---- 이름 ----
  const name = h('input', {
    class: 'entry-name', value: e.name, placeholder: isChar ? '이름' : '이름',
    enterkeyhint: 'next', 'aria-label': '이름',
    oninput: () => { e.name = name.value; save(); checkGuide(); },
  });

  // ---- 별명 (캐릭터) ----
  const aliasBox = isChar ? h('div', { class: 'chips' }) : null;
  function drawAliases() {
    if (!aliasBox) return;
    const input = h('input', {
      class: 'chip-input', placeholder: e.aliases.length ? '+ 별명' : '+ 별명 추가 (예: 마녀)',
      enterkeyhint: 'enter', 'aria-label': '별명 추가',
    });
    const commit = () => {
      const vals = input.value.split(/[,，]/).map((s) => s.trim()).filter((s) => s && !e.aliases.includes(s) && s !== e.name.trim());
      if (!vals.length) { input.value = ''; return false; }
      e.aliases.push(...vals);
      save();
      checkGuide();
      drawAliases();
      aliasBox.querySelector('.chip-input')?.focus();
      return true;
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.isComposing) return;
      if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); commit(); }
      if (ev.key === 'Backspace' && !input.value && e.aliases.length) { e.aliases.pop(); save(); drawAliases(); aliasBox.querySelector('.chip-input')?.focus(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) commit(); });
    aliasBox.replaceChildren(
      ...e.aliases.map((a, i) => h('span', { class: 'chip', style: `--c:${e.color}` }, a,
        h('button', { class: 'chip-x', 'aria-label': a + ' 지우기', onclick: () => { e.aliases.splice(i, 1); save(); drawAliases(); } }, '×'))),
      input);
  }
  drawAliases();

  // ---- 표시 색 (캐릭터): 팔레트 8개 + 마지막 칸은 직접 고르기 ----
  const headDot = h('span', { class: 'dot xl', style: `--c:${e.color}` });
  let colors = null;
  if (isChar) {
    const picker = h('input', { type: 'color', value: COLORS.includes(e.color) ? '#e0607e' : e.color, 'aria-label': '색 직접 고르기' });
    const customSw = h('label', { class: 'swatch custom', title: '직접 고르기' }, picker);
    const swatches = COLORS.map((c) => h('button', { class: 'swatch', style: `--c:${c}`, 'aria-label': '색 ' + c, onclick: () => setColor(c) }));
    const sync = () => {
      swatches.forEach((b, i) => b.classList.toggle('on', COLORS[i] === e.color));
      const custom = !COLORS.includes(e.color);
      customSw.classList.toggle('on', custom);
      customSw.classList.toggle('picked', custom);
      if (custom) customSw.style.setProperty('--c', e.color);
    };
    const setColor = (c) => {
      e.color = c;
      save();
      headDot.style.setProperty('--c', c);
      drawAliases();
      sync();
    };
    picker.addEventListener('input', () => setColor(picker.value));
    colors = h('div', { class: 'swatches', 'aria-label': '표시 색' }, swatches, customSw);
    sync();
  }

  // ---- 설정 항목 ----
  const fieldBox = h('div', { class: 'fields' });
  const suggestBox = h('div', { class: 'suggest' });
  function drawFields(focusId) {
    fieldBox.replaceChildren(...e.fields.map((f) => {
      const label = h('input', {
        class: 'field-label', value: f.label, placeholder: '항목', 'aria-label': '항목 이름',
        oninput: () => { f.label = label.value; save(); },
      });
      const value = autogrow(h('textarea', {
        class: 'field-value', rows: 1, placeholder: '내용', 'aria-label': f.label || '내용',
        oninput: () => { f.value = value.value; save(); },
      }));
      value.value = f.value;
      if (f.id === focusId) setTimeout(() => (f.label ? value : label).focus(), 30);
      return h('div', { class: 'field' },
        h('div', { class: 'field-top' }, label,
          h('button', { class: 'icon-btn sm', 'aria-label': '항목 지우기', onclick: () => { e.fields = e.fields.filter((x) => x !== f); save(); drawFields(); } }, icon('close'))),
        value);
    }));
    const used = new Set(e.fields.map((f) => f.label.trim()));
    const add = (label) => { const f = { id: uid(), label, value: '' }; e.fields.push(f); save(); drawFields(f.id); };
    suggestBox.replaceChildren(
      ...t.fields.filter((l) => !used.has(l)).slice(0, 6).map((l) => h('button', { class: 'suggest-chip', onclick: () => add(l) }, '+ ' + l)),
      h('button', { class: 'suggest-chip plain', onclick: () => add('') }, '+ 직접 추가'));
  }
  drawFields();

  // ---- 메모 ----
  const note = autogrow(h('textarea', {
    class: 'entry-note', placeholder: '자유롭게 적어 두는 곳', 'aria-label': '메모',
    oninput: () => { e.note = note.value; save(); },
  }));
  note.value = e.note;

  // ---- 등장한 화 (캐릭터) ----
  let appearBox = null;
  if (isChar && e.name.trim()) {
    const apps = appearances(e);
    appearBox = h('section', { class: 'entry-sec' },
      h('h3', null, '등장한 화', apps.length ? h('span', { class: 'count' }, apps.length) : null),
      apps.length
        ? h('div', { class: 'list flat' }, apps.map((a) => h('button', {
          class: 'row-main appear',
          onclick: () => { setJump(a.chapter.id, a.first, a.len); go(`/w/${wid}/c/${a.chapter.id}`); },
        }, h('span', null, a.chapter.title), h('span', { class: 'muted' }, `${a.count}번 언급`), icon('chev', 'chev'))))
        : h('p', { class: 'muted small' }, '아직 본문에 나오지 않았어요. 이름이나 별명을 쓰면 여기에 자동으로 모여요.'));
  }

  function menu() {
    actions([
      foldersOf(wid, e.type).length || e.folderId ? { label: '폴더로 옮기기', run: () => moveToFolder(e) } : null,
      { label: '삭제', danger: true, run: () => {
        del('entries', e.id);
        back(listPath);
        toast(`‘${e.name || '이름 없음'}’${josa(e.name || '음', '을', '를')} 지웠어요.`, {
          action: '되돌리기', duration: 6000,
          onAction: () => { put('entries', e, { touch: false }); go(location.hash.slice(1), { replace: true }); },
        });
      } },
    ]);
  }

  const el = h('div', { class: 'screen' },
    topbar({ onBack: () => back(listPath), title: t.label, right: [iconBtn('more', '메뉴', menu)] }),
    h('main', { class: 'content entry' },
      h('div', { class: 'entry-head' }, isChar ? headDot : icon(t.icon, 'type-ic'), name),
      isChar ? h('section', { class: 'entry-sec' }, h('h3', null, '별명'), aliasBox,
        h('p', { class: 'muted small' }, '이름과 별명이 본문에 나오면 형광펜으로 표시돼요.')) : null,
      isChar ? h('section', { class: 'entry-sec' }, h('h3', null, '표시 색'), colors) : null,
      h('section', { class: 'entry-sec' }, h('h3', null, '설정'), fieldBox, suggestBox),
      h('section', { class: 'entry-sec' }, h('h3', null, '메모'), note),
      appearBox));

  if (!e.name) setTimeout(() => name.focus(), 60);
  else hintOnce('entry-autosave', '적는 즉시 저장돼요. 따로 저장 버튼은 없어요.');

  el.cleanup = () => {
    save.flush();
    const blank = !e.name.trim() && !e.aliases.length && !e.note.trim() && !e.fields.some((f) => f.value.trim());
    if (blank && db.entries.has(e.id)) del('entries', e.id);
  };
  return el;
}
