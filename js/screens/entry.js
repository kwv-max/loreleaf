// 설정 한 장 (캐릭터, 장소 등). 양식을 채우는 느낌이 아니라 메모장에 적는 느낌으로.
// 적는 즉시 저장되고, 이름을 비운 채 나가면 조용히 사라진다.
import { h, icon, iconBtn, topbar, debounce, autogrow, actions, toast, hintOnce, josa, pickIcon, sheet } from '../ui.js';
import {
  db, put, del, typeOf, typesOf, iconOf, uid, COLORS, foldersOf, chaptersOf, entriesOf, createEntry, charactersOf,
  relationsOf, relationBetween, createRelation, sidesFor, otherOf, isBlankRelation, removeRelationsOf,
} from '../store.js';
import { appearances } from '../highlight.js';
import { go, back } from '../router.js';
import { emit } from '../guide.js';
import { setJump } from './editor.js';
import { mentions, replaceEverywhere } from '../rename.js';
import { t as tr } from '../i18n.js';
import { moveToFolder } from './lore.js';
import {
  orderOf, valueAt, historyOf, hasChanges, removeChange, factSheet, pruneSame,
  setViewAt, viewAtFor, linkOf, namedOfType, linkParts, mentionsOf,
} from '../timeline.js';

export function entryScreen({ wid, eid }) {
  const e = db.entries.get(eid);
  if (!e || e.workId !== wid) { go(`/w/${wid}/lore`, { replace: true }); return null; }
  const t = typeOf(e.type, wid);
  const isChar = e.type === 'character';
  const listPath = `/w/${wid}/lore/${e.type}` + (e.folderId ? '/' + e.folderId : '');
  const save = debounce(() => put('entries', e), 400);
  const order = orderOf(wid);
  let atCid = viewAtFor(wid); // null = 최신(마지막 화까지). 글을 쓰다 들어오면 그 화 시점
  const atIdx = () => (atCid ? order.get(atCid) : Infinity);
  const chTitle = (id) => db.chapters.get(id)?.title || '';
  const checkGuide = () => { if (e.name.trim() && e.aliases.length) emit('alias-added'); };

  // ---- 이름 ----
  const name = h('input', {
    class: 'entry-name', value: e.name, placeholder: tr('entry.name'),
    enterkeyhint: 'next', 'aria-label': tr('entry.name'),
    oninput: () => { e.name = name.value; save(); checkGuide(); },
  });

  // ---- 이름을 바꾸면: 본문과 다른 설정에 나온 옛 이름도 바꿀지 묻는다 ----
  let nameBefore = e.name.trim();
  function askRename() {
    const from = nameBefore, to = e.name.trim();
    if (!from || !to || from === to) return;
    nameBefore = to;
    const m = mentions(wid, from, to);
    if (!m.total) return;
    const shared = [...db.entries.values()].some((o) => o !== e && o.workId === wid && (o.name.trim() === from || o.aliases?.includes(from)));
    const chLines = m.chapters.slice(0, 4).map(({ c, n }) => tr('rename.chapterCount', { title: c.title, n }));
    if (m.chapters.length > 4) chLines.push(tr('rename.moreChapters', { n: m.chapters.length - 4 }));
    let done = false;
    const s = sheet(h('div', { class: 'rename-sheet' },
      h('p', { class: 'rename-sum' },
        m.inText ? tr('rename.inText', { n: m.inText }) : null, m.inText && m.settings ? ' · ' : null, m.settings ? tr('rename.inSettings', { n: m.settings }) : null),
      chLines.length ? h('p', { class: 'muted small' }, chLines.join(' · ')) : null,
      m.samples.length ? h('div', { class: 'rename-samples' }, m.samples.map((x) => h('div', null, x.before, h('mark', { class: 'hit' }, x.hit), x.after))) : null,
      h('p', { class: 'muted small' },
        tr('rename.note')),
      shared ? h('p', { class: 'rename-warn' }, tr('rename.shared', { name: from })) : null,
      h('button', {
        class: 'btn primary',
        onclick: async () => {
          done = true;
          s.close();
          const r = await replaceEverywhere(wid, from, to);
          drawFields(); drawRelations(); drawMentions();
          toast(tr('rename.done', { n: r.count, to }), {
            action: tr('common.undo'), duration: 8000,
            onAction: () => { r.undo(); drawFields(); drawRelations(); drawMentions(); toast(tr('rename.undone')); },
          });
        },
      }, tr('rename.all', { n: m.total })),
      h('button', { class: 'link-btn center', onclick: () => s.close() }, tr('rename.keep'))),
    { title: tr('rename.title', { from, to }), onClose: () => { if (!done) nameBefore = to; } });
  }
  name.addEventListener('change', askRename); // 이름 칸을 벗어날 때

  // ---- 별명 (캐릭터) ----
  const aliasBox = isChar ? h('div', { class: 'chips' }) : null;
  function drawAliases() {
    if (!aliasBox) return;
    const input = h('input', {
      class: 'chip-input', placeholder: e.aliases.length ? tr('entry.aliasMore') : tr('entry.aliasFirst'),
      enterkeyhint: 'enter', 'aria-label': tr('entry.aliasAdd'),
    });
    const commit = () => {
      const vals = input.value.split(/[,，]/).map((s) => s.trim()).filter((s) => s && !e.aliases.includes(s) && s !== e.name.trim());
      if (!vals.length) { input.value = ''; return false; }
      e.aliases.push(...vals);
      save();
      checkGuide();
      const shared = vals.flatMap((v) => [...db.entries.values()]
        .filter((o) => o !== e && o.workId === wid && o.type === 'character' && (o.name.trim() === v || o.aliases.includes(v)))
        .map((o) => [v, o.name]));
      if (shared.length) {
        const [v, who] = shared[0];
        toast(tr('entry.aliasShared', { alias: v, who }), { duration: 5000 });
      }
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
        h('button', { class: 'chip-x', 'aria-label': tr('entry.aliasRemove', { alias: a }), onclick: () => { e.aliases.splice(i, 1); save(); drawAliases(); } }, '×'))),
      input);
  }
  drawAliases();

  // ---- 아이콘 (캐릭터 말고): 누르면 이 항목만 다른 아이콘 ----
  const headIcon = isChar ? null : h('button', {
    class: 'entry-icon', 'aria-label': tr('entry.changeIcon'),
    onclick: async () => {
      const ic = await pickIcon(iconOf(e), { title: tr('common.icon'), defaultLabel: e.icon ? tr('entry.defaultIcon', { label: t.label }) : null });
      if (ic == null) return;
      e.icon = ic || undefined;
      save();
      headIcon.replaceChildren(icon(iconOf(e)));
    },
  }, icon(iconOf(e)));

  // ---- 표시 색 (캐릭터): 팔레트 8개 + 마지막 칸은 직접 고르기 ----
  const headDot = h('span', { class: 'dot xl', style: `--c:${e.color}` });
  let colors = null;
  if (isChar) {
    const picker = h('input', { type: 'color', value: COLORS.includes(e.color) ? '#e0607e' : e.color, 'aria-label': tr('entry.pickColor') });
    const customSw = h('label', { class: 'swatch custom', title: tr('entry.custom') }, picker);
    const swatches = COLORS.map((c) => h('button', { class: 'swatch', style: `--c:${c}`, 'aria-label': tr('entry.color', { c }), onclick: () => setColor(c) }));
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
    colors = h('div', { class: 'swatches', 'aria-label': tr('entry.colors') }, swatches, customSw);
    sync();
  }

  // ---- 시점: 바뀐 기록이 있을 때만 보인다 ----
  const atBar = h('div', { class: 'at-bar' });
  function drawAt() {
    const relChanged = relationsOf(e.id).some((r) => r.ab.changes?.length || r.ba.changes?.length);
    const show = order.size > 1 && (hasChanges(e) || relChanged || atCid);
    atBar.hidden = !show;
    if (!show) return;
    atBar.replaceChildren(
      h('span', { class: 'muted small' }, tr('entry.at')),
      h('button', { class: 'at-btn', onclick: pickAt }, atCid ? chTitle(atCid) : tr('entry.latest'), icon('down')));
  }
  function pickAt() {
    actions([
      { label: (atCid ? '' : '✓ ') + tr('entry.latest'), run: () => setAt(null) },
      ...chaptersOf(wid).map((c) => ({ label: (c.id === atCid ? '✓ ' : '') + c.title, run: () => setAt(c.id) })),
    ], tr('entry.atWhich'));
  }
  function setAt(cid) { atCid = cid; setViewAt(wid, cid); drawAt(); drawFields(); drawMentions(); drawRelations(); }

  // ---- 설정 항목 ----
  // 보이는 값은 지금 시점의 값. 고치면 그 값이 나온 기록(처음 값 또는 n화 기록)이 고쳐진다.
  // 화마다 바뀐 값은 '＋ 몇 화부터 바뀜'으로 따로 남긴다.
  const fieldBox = h('div', { class: 'fields' });
  const suggestBox = h('div', { class: 'suggest' });
  const opened = new Set(); // 기록을 펼친 항목
  let closeOpenPeek = null; // 지금 펼쳐진 이름 미리보기
  const keepFocus = (b) => { b.addEventListener('pointerdown', (ev) => ev.preventDefault()); return b; };
  function drawFields(focusId) {
    closeOpenPeek = null;
    fieldBox.replaceChildren(...e.fields.map((f) => {
      const cur = valueAt(f, atIdx(), order);
      const label = h('input', {
        class: 'field-label', value: f.label, placeholder: tr('entry.fieldPh'), 'aria-label': tr('entry.fieldName'),
        oninput: () => { f.label = label.value; save(); },
      });
      const value = autogrow(h('textarea', {
        class: 'field-value', rows: 1, placeholder: tr('entry.valuePh'), 'aria-label': f.label || tr('entry.valuePh'),
        oninput: () => { if (cur.rec) cur.rec.value = value.value; else f.value = value.value; save(); drawChips(); },
      }));
      value.value = cur.value;
      value.addEventListener('select', () => onSelect(value, f));
      // 고치다 보니 앞 화와 똑같아졌으면, 그 화에서 바뀐 게 아니니 기록을 없앤다
      value.addEventListener('change', () => {
        const n = pruneSame(f, order);
        if (!n) return;
        save();
        toast(tr('fact.pruned', { n }));
        setTimeout(() => {
          const a = document.activeElement;
          drawAt();
          drawFields(fieldBox.contains(a) ? a.closest('.field')?.dataset.fid : undefined);
        }, 0);
      });

      // 연결: 이 항목 값에 나오는 이름을 어느 목록에서 찾을지 (보이는 이름과 따로 정한다)
      const link = linkOf(f);
      const linkPill = keepFocus(h('button', {
        class: 'link-pill' + (link ? ' on' : ''),
        onclick: () => actions([
          { label: (link ? '' : '✓ ') + tr('entry.linkNone'), run: () => { f.link = null; save(); drawFields(); } },
          ...typesOf(wid).filter((x) => x.key !== 'memo').map((x) => ({
            label: (link === x.key ? '✓ ' : '') + tr('entry.linkList', { label: x.label }),
            run: () => { f.link = x.key; save(); drawFields(); },
          })),
        ], tr('entry.linkAsk', { field: f.label })),
      }, link ? `→ ${typeOf(link, wid).label}` : tr('entry.link')));
      // 연결된 항목은 평소엔 형광펜 보기(이름을 누르면 아래에 미리보기), 글 부분을 누르면 고치기
      const targets = () => (link ? namedOfType(wid, link).filter((x) => x !== e) : []);
      const view = link ? h('div', { class: 'field-value field-view', onclick: (ev) => tapView(ev) }) : null;
      const peek = h('div', { class: 'lk-peek', hidden: true });
      let peekId = null;
      function drawView() {
        if (!view) return;
        view.replaceChildren(...(value.value
          ? linkParts(value.value, targets()).map((p) => (p.e
            ? h('mark', { class: 'lk' + (p.e.id === peekId ? ' on' : ''), 'data-id': p.e.id, style: `--c:${p.e.color || 'var(--accent)'}` }, p.t)
            : p.t))
          : [h('span', { class: 'ph' }, tr('entry.valuePh'))]));
      }
      function editMode(on) {
        if (!view) return;
        view.hidden = on;
        value.hidden = !on;
        if (!on) drawView();
      }
      function tapView(ev) {
        const m = ev.target.closest('mark.lk');
        if (m) { togglePeek(m.dataset.id); return; }
        // 누른 자리에 커서를 두고 고치기
        const at = offsetAt(view, ev.clientX, ev.clientY, value.value.length);
        closePeek();
        editMode(true);
        value.dispatchEvent(new Event('input')); // 높이 맞추기
        value.focus();
        value.setSelectionRange(at, at);
      }
      function closePeek() { if (closeOpenPeek === closePeek) closeOpenPeek = null; peekId = null; peek.hidden = true; peek.replaceChildren(); drawView(); }
      function togglePeek(id) {
        if (peekId === id) { closePeek(); return; }
        const x = db.entries.get(id);
        if (!x) return;
        if (closeOpenPeek !== closePeek) closeOpenPeek?.(); // 미리보기는 화면에 하나만
        closeOpenPeek = closePeek;
        peekId = id;
        peek.hidden = false;
        peek.replaceChildren(...peekOf(x, closePeek));
        drawView();
      }
      if (view) { value.addEventListener('blur', () => { closeSel(); editMode(false); }); editMode(false); }

      // 입력 중에는 지금 치는 말에 맞는 이름만 몇 개 추천 (누르면 그 말을 이름으로 바꾼다)
      const chips = h('div', { class: 'link-chips' });
      function drawChips() {
        if (!link) { chips.replaceChildren(); return; }
        const text = value.value;
        const cut = Math.max(...[',', '，', '、', '/', '·', '\n'].map((s) => text.lastIndexOf(s))) + 1;
        const token = text.slice(cut).trim();
        const found = new Set(linkParts(text, targets()).filter((p) => p.e).map((p) => p.e));
        const pool = targets().filter((x) => !found.has(x));
        const hits = (token ? pool.filter((x) => x.name.includes(token) || x.aliases?.some((a) => a.includes(token))) : pool).slice(0, 6);
        chips.replaceChildren(...hits.map((x) => keepFocus(h('button', {
          class: 'lk-chip add',
          style: `--c:${x.color || 'var(--accent)'}`,
          onclick: () => {
            const head = text.slice(0, cut).replace(/\s*$/, '');
            value.value = head ? `${head}${/[,，、/·]$/.test(head) ? ' ' : ', '}${x.name}` : x.name;
            value.dispatchEvent(new Event('input'));
          },
        }, '+ ' + x.name))));
      }
      drawChips();
      if (f.id === focusId) setTimeout(() => { editMode(true); (f.label ? value : label).focus(); }, 30);

      const hist = historyOf(f, order);
      const open = opened.has(f.id);
      const meta = hist.length > 1 ? h('button', {
        class: 'field-meta',
        onclick: () => { open ? opened.delete(f.id) : opened.add(f.id); drawFields(); },
      }, cur.rec ? tr('entry.sinceValue', { title: chTitle(cur.rec.chapterId) }) : tr('entry.firstValue'), tr('entry.changes', { n: hist.length - 1 }), icon(open ? 'up' : 'down')) : null;
      const histList = hist.length > 1 && open ? h('div', { class: 'hist' }, hist.map((r) => h('div', { class: 'hist-row' + (r.rec === cur.rec ? ' on' : '') },
        h('button', { class: 'hist-main', disabled: !r.rec, onclick: () => r.rec && setAt(r.rec.chapterId) },
          h('span', { class: 'hist-when' }, r.rec ? chTitle(r.rec.chapterId) : tr('entry.first')),
          h('span', { class: 'hist-val' }, r.value || tr('entry.cleared'))),
        r.rec ? h('button', {
          class: 'icon-btn sm', 'aria-label': tr('entry.removeRecord'),
          onclick: () => {
            const n = removeChange(e, f, r.rec);
            if (n) toast(tr('entry.prunedAfter', { n }));
            drawAt(); drawFields();
          },
        }, icon('close')) : null))) : null;
      const addChange = order.size ? keepFocus(h('button', {
        class: 'field-act',
        onclick: async () => {
          save.flush();
          if (await factSheet(e, f, { mode: 'change', cid: atCid })) { opened.add(f.id); drawAt(); drawFields(); }
        },
      }, tr('entry.addChange'))) : null;

      return h('div', { class: 'field' + (open ? ' open' : ''), 'data-fid': f.id },
        h('div', { class: 'field-top' }, label, linkPill,
          keepFocus(h('button', { class: 'icon-btn sm', 'aria-label': tr('entry.removeField'), onclick: () => { e.fields = e.fields.filter((x) => x !== f); save(); drawFields(); } }, icon('close')))),
        view, value, peek, chips, meta, histList, addChange);
    }));
    const used = new Set(e.fields.map((f) => f.label.trim()));
    const add = (label) => { const f = { id: uid(), label, value: '' }; e.fields.push(f); save(); drawFields(f.id); };
    suggestBox.replaceChildren(
      ...[...new Set([...t.fields, ...entriesOf(wid, e.type).flatMap((x) => x.fields.map((f) => f.label.trim()))])]
        .filter((l) => l && !used.has(l)).slice(0, 6).map((l) => h('button', { class: 'suggest-chip', onclick: () => add(l) }, '+ ' + l)),
      h('button', { class: 'suggest-chip plain', onclick: () => add('') }, tr('entry.addCustom')));
  }
  // 형광펜 이름을 눌렀을 때 항목 아래에 펼치는 미리보기
  function peekOf(x, close) {
    const xt = typeOf(x.type, wid);
    const facts = x.fields
      .map((f) => [f.label.trim(), valueAt(f, atIdx(), order).value.trim()])
      .filter(([l, v]) => l && v)
      .slice(0, 4);
    return [
      h('div', { class: 'lk-peek-head' },
        x.type === 'character' ? h('span', { class: 'dot', style: `--c:${x.color}` }) : icon(iconOf(x), 'type-ic'),
        h('b', null, x.name),
        h('span', { class: 'muted small' }, x.type === 'character' && x.aliases.length ? x.aliases.join(' · ') : xt.label),
        h('button', { class: 'icon-btn sm', 'aria-label': tr('common.close'), onclick: close }, icon('close'))),
      facts.length
        ? h('dl', { class: 'peek-facts' }, facts.map(([l, v]) => [h('dt', null, l), h('dd', null, v)]))
        : x.note?.trim() ? h('p', { class: 'lk-peek-note' }, x.note.trim()) : h('p', { class: 'muted small' }, tr('entry.noDetails')),
      h('button', { class: 'link-btn', onclick: () => go(`/w/${wid}/e/${x.id}`) }, tr('entry.open'), icon('chev')),
    ];
  }

  // 글자를 누른 자리 → 값 속 몇 번째 글자인지
  function offsetAt(box, x, y, fallback) {
    let node = null, off = 0;
    const p = document.caretPositionFromPoint?.(x, y);
    if (p) { node = p.offsetNode; off = p.offset; }
    else { const r = document.caretRangeFromPoint?.(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
    if (!node || !box.contains(node) || box.querySelector('.ph')) return box.querySelector('.ph') ? 0 : fallback;
    const r = document.createRange();
    r.setStart(box, 0);
    r.setEnd(node, off);
    return r.toString().length;
  }

  // ---- 글자를 선택하면 설정으로 등록 ----
  // 연결된 항목이면 그 목록으로, 아니면 어느 목록인지 묻고 그 항목을 그 목록과 잇는다.
  let selChip = null;
  function closeSel() { selChip?.remove(); selChip = null; }
  function onSelect(ta, f) {
    if (document.activeElement !== ta) return;
    const s = ta.selectionStart, en = ta.selectionEnd;
    const word = ta.value.slice(s, en).trim();
    const link = linkOf(f);
    const pool = link ? namedOfType(wid, link) : [...db.entries.values()].filter((x) => x.workId === wid);
    const known = pool.some((x) => x.name.trim() === word || x.aliases?.includes(word));
    if (!word || word.length > 20 || /\n/.test(word) || known) { closeSel(); return; }
    const key = `${f.id}:${s}:${en}`;
    if (selChip?.dataset.key === key) return;
    closeSel();
    const kind = link ? typeOf(link, wid).label : null;
    const add = (type) => {
      closeSel();
      createEntry(wid, type, { name: word });
      if (!link) f.link = type;
      save();
      const k = typeOf(type, wid).label;
      toast(tr('entry.registered', { word, kind: k }));
      if (link) { ta.setSelectionRange(en, en); ta.dispatchEvent(new Event('input')); } // 추천 칩 갱신
      else drawFields(); // 연결 표시가 새로 생긴다
    };
    selChip = h('div', { class: 'chip-row', 'data-key': key },
      h('button', {
        class: 'chip-btn',
        onclick: () => (link ? add(link) : actions(
          typesOf(wid).filter((x) => x.key !== 'memo').map((x) => ({ label: tr('entry.linkList', { label: x.label }), run: () => add(x.key) })),
          tr('entry.registerWhere', { word }))),
      }, icon('plus'), link ? tr('entry.registerAs', { word: clip(word), kind }) : tr('entry.registerAny', { word: clip(word) })));
    selChip.addEventListener('pointerdown', (ev) => ev.preventDefault());
    document.body.append(selChip);
  }
  const clip = (s) => (s.length > 8 ? s.slice(0, 8) + '…' : s);
  const onDocSelect = () => {
    const ta = document.activeElement;
    if (!ta?.classList?.contains('field-value')) { closeSel(); return; }
    ta.dispatchEvent(new Event('select'));
  };
  document.addEventListener('selectionchange', onDocSelect);

  // ---- 연결된 곳: 다른 설정에서 이 설정을 가리키는 항목 (시점 기준) ----
  const mentionBox = h('section', { class: 'entry-sec' });
  function drawMentions() {
    const list = e.name.trim() ? mentionsOf(e, atCid) : [];
    mentionBox.hidden = !list.length;
    mentionBox.replaceChildren(
      h('h3', null, tr('entry.mentions'), h('span', { class: 'count' }, list.length)),
      h('div', { class: 'list' }, list.map(({ entry, field, value }) => h('div', { class: 'row' },
        h('button', { class: 'row-main with-icon', onclick: () => go(`/w/${wid}/e/${entry.id}`) },
          entry.color ? h('span', { class: 'dot lg', style: `--c:${entry.color}` }) : icon(iconOf(entry), 'type-ic'),
          h('div', null,
            h('div', { class: 'row-title' }, entry.name, h('span', { class: 'muted small' }, field.label)),
            h('div', { class: 'row-sub' }, value))),
        icon('chev', 'chev')))));
  }

  drawFields();
  drawAt();
  drawMentions();

  // ---- 관계 (캐릭터끼리) ----
  // 두 사람 사이에 기록은 하나. 여기서 적으면 상대 화면에도 그대로 보인다.
  const relBox = isChar ? h('section', { class: 'entry-sec' }) : null;
  const sideText = (side) => valueAt(side, atIdx(), order).value.trim();
  function drawRelations() {
    if (!relBox) return;
    const rels = relationsOf(e.id)
      .map((r) => ({ r, other: db.entries.get(otherOf(r, e.id)) }))
      .filter((x) => x.other)
      .sort((a, b) => a.other.name.localeCompare(b.other.name, 'ko'));
    relBox.replaceChildren(
      h('h3', { class: 'sec-head' }, h('span', null, tr('rel.title'), rels.length ? h('span', { class: 'count' }, rels.length) : null),
        rels.length ? h('button', { class: 'link-btn small', onclick: () => go(`/w/${wid}/graph/${e.id}`) }, tr('rel.graph'), icon('chev')) : null),
      rels.length ? h('div', { class: 'list' }, rels.map(({ r, other }) => {
        const [mine, theirs] = sidesFor(r, e.id);
        const m = sideText(mine), t = sideText(theirs);
        return h('div', { class: 'row' },
          h('button', { class: 'row-main with-icon', onclick: () => relationSheet(r) },
            h('span', { class: 'dot lg', style: `--c:${other.color}` }),
            h('div', null,
              h('div', { class: 'row-title' }, other.name),
              m ? h('div', { class: 'row-sub' }, m) : null,
              t ? h('div', { class: 'row-sub muted' }, tr('rel.theySee', { name: other.name, text: t })) : null,
              !m && !t ? h('div', { class: 'row-sub muted' }, tr('rel.write')) : null)),
          icon('chev', 'chev'));
      })) : null,
      h('div', { class: 'suggest' }, h('button', { class: 'suggest-chip', onclick: addRelation }, tr('rel.add'))));
  }

  // 누구와의 관계인지: 이름이나 별명으로 찾기
  function addRelation() {
    const pool = charactersOf(wid).filter((x) => x.id !== e.id).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (!pool.length) { toast(tr('rel.noOthers')); return; }
    const input = h('input', { class: 'field-input', placeholder: tr('rel.searchPh'), enterkeyhint: 'search', 'aria-label': tr('rel.search') });
    const list = h('div', { class: 'pick-list' });
    let chosen = null;
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const hits = pool.filter((x) => !q || x.name.toLowerCase().includes(q) || x.aliases.some((a) => a.toLowerCase().includes(q)));
      list.replaceChildren(...hits.map((x) => h('button', { class: 'pick-row', type: 'button', onclick: () => { chosen = x; s.close(); } },
        h('span', { class: 'dot', style: `--c:${x.color}` }),
        h('span', { class: 'pick-name' }, x.name),
        h('span', { class: 'muted small pick-sub' }, relationBetween(e.id, x.id) ? tr('rel.already') : x.aliases.join(', ')))),
      hits.length ? null : h('p', { class: 'muted small' }, tr('rel.noMatch')));
    };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || ev.isComposing) return;
      ev.preventDefault();
      list.querySelector('.pick-row')?.click(); // 엔터는 맨 위 사람
    });
    draw();
    const s = sheet(h('div', { class: 'pick-sheet' }, input, list), {
      title: tr('rel.who'),
      onClose: () => { if (chosen) setTimeout(() => relationSheet(relationBetween(e.id, chosen.id) || createRelation(wid, e.id, chosen.id)), 0); },
    });
    setTimeout(() => input.focus(), 60);
  }

  // 관계 한 건 고치기: 보는 방향마다 한 줄 (둘 다 선택). 닫으면 저장되고, 둘 다 비면 관계도 지운다.
  function relationSheet(r) {
    const other = db.entries.get(otherOf(r, e.id));
    if (!other) return;
    const [mine, theirs] = sidesFor(r, e.id);
    let removed = false;
    const sideRow = (side, from, to, autofocus) => {
      const cur = valueAt(side, atIdx(), order);
      const input = autogrow(h('textarea', { class: 'field-input', rows: 1, placeholder: tr('rel.optional'), 'aria-label': tr('rel.sees', { from: from.name, to: to.name }) }));
      input.value = cur.value;
      const hist = historyOf(side, order);
      const el = h('div', { class: 'rel-side' },
        h('div', { class: 'rel-dir' }, h('span', { class: 'dot', style: `--c:${from.color}` }), `${from.name} → ${to.name}`),
        input,
        h('div', { class: 'rel-meta' },
          hist.length > 1 ? h('span', { class: 'muted small' }, (cur.rec ? tr('entry.sinceValue', { title: chTitle(cur.rec.chapterId) }) : tr('entry.firstValue')) + tr('entry.changes', { n: hist.length - 1 })) : h('span'),
          order.size ? h('button', {
            type: 'button', class: 'link-btn small',
            onclick: async () => {
              s.close(); // 닫으면서 지금 적은 것 저장
              if (await factSheet(r, side, { mode: 'change', cid: atCid, title: `${from.name} → ${to.name}` })) { drawAt(); drawRelations(); }
            },
          }, tr('entry.addChange')) : null));
      if (autofocus) setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 60);
      return { side, cur, input, el };
    };
    const A = sideRow(mine, e, other, !sideText(mine) && !sideText(theirs));
    const B = sideRow(theirs, other, e, false);
    const commit = () => {
      for (const x of [A, B]) {
        const v = x.input.value.trim();
        if (x.cur.rec) x.cur.rec.value = v; else x.side.value = v;
        pruneSame(x.side, order);
      }
      if (isBlankRelation(r)) del('relations', r.id);
      else { put('relations', r); emit('relation-added'); }
    };
    const s = sheet(h('form', { class: 'sheet-form', onsubmit: (ev) => { ev.preventDefault(); s.close(); } },
      atCid ? h('p', { class: 'muted small' }, tr('rel.atChapter', { title: chTitle(atCid) })) : null,
      A.el, B.el,
      h('p', { class: 'muted small' }, tr('rel.oneSide')),
      h('button', { class: 'btn primary', type: 'submit' }, tr('common.save')),
      h('div', { class: 'rel-foot' },
        h('button', {
          type: 'button', class: 'link-btn danger',
          onclick: () => {
            removed = true;
            del('relations', r.id);
            s.close();
            toast(tr('rel.deleted', { name: other.name }), {
              action: tr('common.undo'), duration: 6000,
              onAction: () => { put('relations', r, { touch: false }); drawRelations(); drawAt(); },
            });
          },
        }, tr('rel.delete')),
        h('button', { type: 'button', class: 'link-btn', onclick: () => { s.close(); go(`/w/${wid}/e/${other.id}`); } }, tr('rel.openOther', { name: other.name }), icon('chev')))),
    { title: `${e.name} ↔ ${other.name}`, onClose: () => { if (!removed) commit(); drawRelations(); drawAt(); } });
  }
  drawRelations();

  // ---- 메모 ----
  const note = autogrow(h('textarea', {
    class: 'entry-note', placeholder: tr('entry.notePh'), 'aria-label': tr('entry.note'),
    oninput: () => { e.note = note.value; save(); },
  }));
  note.value = e.note;

  // ---- 등장한 화 (캐릭터) ----
  let appearBox = null;
  if (isChar && e.name.trim()) {
    const apps = appearances(e);
    appearBox = h('section', { class: 'entry-sec' },
      h('h3', null, tr('entry.appears'), apps.length ? h('span', { class: 'count' }, apps.length) : null),
      apps.length
        ? h('div', { class: 'list flat' }, apps.map((a) => h('button', {
          class: 'row-main appear',
          onclick: () => { setJump(a.chapter.id, a.first, a.len); go(`/w/${wid}/c/${a.chapter.id}`); },
        }, h('span', null, a.chapter.title), h('span', { class: 'muted' }, tr('entry.mentionCount', { n: a.count })), icon('chev', 'chev'))))
        : h('p', { class: 'muted small' }, tr('entry.notYet')));
  }

  function menu() {
    actions([
      foldersOf(wid, e.type).length || e.folderId ? { label: tr('entry.moveFolder'), run: () => moveToFolder(e) } : null,
      { label: tr('common.delete'), danger: true, run: () => {
        save.cancel(); // 지운 뒤에 남은 저장이 되살리지 않도록
        del('entries', e.id);
        const gone = removeRelationsOf(e.id);
        back(listPath);
        toast(tr('entry.deleted', { name: e.name }), {
          action: tr('common.undo'), duration: 6000,
          onAction: () => { put('entries', e, { touch: false }); for (const r of gone) put('relations', r, { touch: false }); go(location.hash.slice(1), { replace: true }); },
        });
      } },
    ]);
  }

  const el = h('div', { class: 'screen' },
    topbar({ onBack: () => back(listPath), title: t.label, right: [iconBtn('more', tr('common.menu'), menu)] }),
    h('main', { class: 'content entry' },
      h('div', { class: 'entry-head' }, isChar ? headDot : headIcon, name),
      isChar ? h('section', { class: 'entry-sec' }, h('h3', null, tr('entry.aliases')), aliasBox,
        h('p', { class: 'muted small' }, tr('entry.aliasesNote'))) : null,
      isChar ? h('section', { class: 'entry-sec' }, h('h3', null, tr('entry.colors')), colors) : null,
      h('section', { class: 'entry-sec' }, h('h3', null, tr('entry.details')), atBar, fieldBox, suggestBox),
      relBox,
      mentionBox,
      h('section', { class: 'entry-sec' }, h('h3', null, tr('entry.note')), note),
      appearBox));

  if (!e.name) setTimeout(() => name.focus(), 60);
  else hintOnce('entry-autosave', tr('entry.autosave'));

  el.cleanup = () => {
    document.removeEventListener('selectionchange', onDocSelect);
    closeSel();
    if (!db.entries.has(e.id)) return; // 이미 지운 설정은 다시 저장하지 않는다
    save.flush();
    // 이름을 바꾸고 칸을 벗어나기 전에 화면을 떠났으면, 다음 화면에서 묻는다
    if (e.name.trim() && nameBefore && e.name.trim() !== nameBefore) setTimeout(askRename, 80);
    const blank = !e.name.trim() && !e.aliases.length && !e.note.trim() && !e.fields.some((f) => f.value.trim());
    if (blank && db.entries.has(e.id)) { del('entries', e.id); removeRelationsOf(e.id); }
  };
  return el;
}
