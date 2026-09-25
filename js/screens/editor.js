// 글쓰기 화면. 쓰는 동안엔 글만 보이게: 얇은 상단바 하나, 나머지는 필요할 때만 뜬다.
//
// 구조: 표시용 레이어(.ed-backdrop) 위에 투명 배경 textarea를 겹친다.
// 형광펜과 대사 따옴표는 뒤 레이어에만 그려지므로 원고 텍스트에는 어떤 서식도 들어가지 않는다.
import { h, icon, iconBtn, debounce, num, toast, actions, ask, askLong, hintOnce, josa } from '../ui.js';
import { db, put, uid, chaptersOf, charactersOf, createChapter, createEntry, stashDraft, clearDraft, touchWork, typeOf, typesOf, iconOf,
  relationsOf, sidesFor, otherOf,
} from '../store.js';
import { buildMatcher, highlightHTML, appearances, findAll, findHTML, notesHTML } from '../highlight.js';
import { go, back, interceptBack } from '../router.js';
import { emit } from '../guide.js';
import { lineSwipe } from '../swipe.js';
import { quoteState, unquote, quoteChars, flagsOf, packFlags, remapFlags, wrapLine, manuscriptText, lengthOf } from '../quotes.js';
import { pref } from '../prefs.js';
import { setSearchQuery } from './search.js';
import { diffRange, remapRange } from '../anchors.js';
import { orderOf, valueAt, changesIn, factSheet, setViewAt, linkOf, namedOfType, linkParts } from '../timeline.js';
import { exportChapter } from './library.js';

let jump = null; // 다른 화면에서 "이 위치로 가서 보여줘" 요청 (find가 있으면 찾기 막대도 연다)
let enterFrom = null; // 화를 넘겨 들어올 때 밀려 들어오는 방향 ('left' | 'right')
export function setJump(cid, index, len, find = null) { jump = { cid, index, len, find }; }

const posKey = (cid) => 'll:pos:' + cid;
const loadPos = (cid) => { try { return JSON.parse(localStorage.getItem(posKey(cid)) || 'null'); } catch { return null; } };

export function editorScreen({ wid, cid }) {
  const work = db.works.get(wid);
  const ch = db.chapters.get(cid);
  if (!work || !ch) { go('/', { replace: true }); return null; }

  if (work.lastChapterId !== cid) { work.lastChapterId = cid; put('works', work, { touch: false }); }

  let matcher = buildMatcher(charactersOf(wid));
  let flags = flagsOf(ch); // 줄마다 대사 표시: 0 | 'd' | 's'
  let notes = (ch.notes || []).map((n) => ({ ...n })); // 주석: { id, start, end, text } (글자 위치에 붙는다)
  let prevText = ch.text;

  // ---- 상단바 ----
  const titleBtn = h('button', { class: 'topbar-title as-btn', onclick: rename }, ch.title);
  const count = h('span', { class: 'ed-count' });
  const peekL = h('span', { class: 'title-peek left', 'aria-hidden': 'true' });
  const peekR = h('span', { class: 'title-peek right', 'aria-hidden': 'true' });
  const top = h('header', { class: 'topbar ed-top' },
    h('div', { class: 'topbar-row' },
      iconBtn('back', '뒤로', () => back('/w/' + wid)),
      h('div', { class: 'title-wrap' }, peekL, peekR, titleBtn),
      count,
      iconBtn('search', '이 화에서 찾기', () => openFind(fb?.q || '')),
      iconBtn('more', '더 보기', menu)));

  // ---- 본문 ----
  const backdrop = h('div', { class: 'ed-backdrop', 'aria-hidden': 'true' });
  const findLayer = h('div', { class: 'ed-find', 'aria-hidden': 'true' });
  const notesLayer = h('div', { class: 'ed-notes', 'aria-hidden': 'true' });
  const ta = h('textarea', {
    class: 'ed-text',
    placeholder: '여기에 쓰면 돼요. 저장은 알아서 돼요.',
    spellcheck: false, autocomplete: 'off', autocapitalize: 'off',
    'aria-label': '본문',
  });
  ta.value = ch.text;
  const wrap = h('div', { class: 'ed-wrap' }, backdrop, findLayer, notesLayer, ta);
  const el = h('div', { class: 'screen editor' }, top, wrap);
  el.keepScroll = true;

  // ---- 그리기 ----
  let highlightSeen = false;
  const lineText = (i) => ta.value.split('\n')[i] ?? '';
  const lineHTML = (i) => highlightHTML(lineText(i), matcher, [flags[i]]);
  function paint() {
    wrap.classList.toggle('qs-straight', pref('quotes') === 'straight');
    wrap.classList.toggle('qs-corner', pref('quotes') === 'corner');
    backdrop.innerHTML = highlightHTML(ta.value, matcher, flags);
    notesLayer.innerHTML = notesHTML(ta.value, notes);
    if (!highlightSeen && backdrop.querySelector('mark')) { highlightSeen = true; emit('highlight-shown'); }
  }
  const currentChapter = () => ({ text: ta.value, quotes: packFlags(flags) });
  const updateCount = debounce(() => { count.textContent = num(lengthOf(currentChapter())) + '자'; }, 300);

  // ---- 저장 ----
  let dirty = false;
  const save = debounce(() => {
    if (!dirty) return;
    dirty = false;
    ch.text = ta.value;
    ch.quotes = packFlags(flags);
    ch.notes = notes.map((n) => ({ ...n }));
    put('chapters', ch).then(() => clearDraft(ch.id));
    touchWork(wid);
  }, 600);
  const stash = debounce(() => stashDraft(ch.id, ta.value, packFlags(flags), notes), 150);
  const savePos = debounce(() => {
    try { localStorage.setItem(posKey(cid), JSON.stringify({ sel: ta.selectionStart, y: window.scrollY })); } catch {}
  }, 300);
  function markDirty() {
    dirty = true;
    save();
    stash();
    updateCount();
  }

  // ---- 되돌리기 / 다시 하기 ----
  // 브라우저 기본 되돌리기는 글자만 기억해서 대사 줄 표시가 어긋난다. 글과 표시를 함께 기억하는 기록을 따로 둔다.
  const undoStack = [], redoStack = [];
  let burst = null; // 지금 이어지고 있는 입력 묶음 { start, last }
  let lastSel = [0, 0];
  const stateNow = (sel = [ta.selectionStart, ta.selectionEnd]) => ({ text: prevText, flags: flags.slice(), notes: notes.map((n) => ({ ...n })), sel });
  function beginStep(sel) {
    undoStack.push(stateNow(sel));
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  // 여러 변경을 되돌리기 한 번에 묶는다 (대사 표시, 붙여넣기 등)
  function asOneStep(fn) {
    beginStep();
    burst = { start: Date.now(), last: Date.now() };
    try { fn(); } finally { burst = null; }
    updateBar();
  }
  function restore(st) {
    ta.value = prevText = st.text;
    flags = st.flags.slice();
    notes = st.notes.map((n) => ({ ...n }));
    ta.setSelectionRange(st.sel[0], st.sel[1]);
    burst = null;
    paint();
    if (fb) refreshFind(false);
    markDirty();
    revealCaret();
    updateBar();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(stateNow()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(stateNow()); restore(redoStack.pop()); }
  function revealCaret() {
    const b = backdrop.children[curLine()];
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vv = window.visualViewport;
    const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 60;
    if (r.bottom < 60 || r.top > bottom) b.scrollIntoView({ block: 'center' });
  }
  ta.addEventListener('beforeinput', (e) => {
    // 키보드 앱 등에서 오는 기본 되돌리기도 이쪽 기록으로
    if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); return; }
    if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); return; }
    lastSel = [ta.selectionStart, ta.selectionEnd];
  });
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });

  // ---- 키보드 위 막대: 터치 기기에서 입력 중일 때만 보인다 ----
  const hold = (b) => { b.addEventListener('pointerdown', (e) => e.preventDefault()); return b; }; // 눌러도 키보드가 내려가지 않게
  const bUndo = hold(iconBtn('undo', '되돌리기', undo));
  const bRedo = hold(iconBtn('redo', '다시 하기', redo));
  const qBtn = (flag, word) => hold(h('button', { class: 'kb-q', onclick: () => toggleFlag(flag) },
    h('span', { class: 'kb-q-g' }), word));
  const qD = qBtn('d', '대사');
  const qS = qBtn('s', '생각');
  const bar = h('div', { class: 'kb-bar', role: 'toolbar', 'aria-label': '글쓰기 도구' },
    bUndo, bRedo, h('span', { class: 'kb-sep' }), qD, qS);
  const coarse = matchMedia('(pointer: coarse)').matches;
  let barTimer = null;
  function showBar() {
    clearTimeout(barTimer);
    if (!coarse) return; // PC는 Ctrl+Z 같은 단축키로 충분하다
    qD.firstChild.textContent = quoteChars('d').join('');
    qS.firstChild.textContent = quoteChars('s').join('');
    if (!bar.isConnected) document.body.append(bar);
    document.documentElement.style.setProperty('--bar', '48px');
    updateBar();
  }
  function hideBar() {
    barTimer = setTimeout(() => { bar.remove(); document.documentElement.style.removeProperty('--bar'); }, 150);
  }
  function updateBar() {
    if (!bar.isConnected) return;
    bUndo.disabled = !undoStack.length;
    bRedo.disabled = !redoStack.length;
    const f = flags[curLine()];
    qD.classList.toggle('on', f === 'd');
    qS.classList.toggle('on', f === 's');
  }
  ta.addEventListener('focus', showBar);
  ta.addEventListener('blur', hideBar);

  ta.addEventListener('input', (e) => {
    // 되돌리기 단계 나누기: 1초 넘게 쉬었거나, 5초 넘게 이어졌거나, 줄을 바꾸면 새 단계
    const now = Date.now();
    if (!burst || now - burst.last > 1000 || now - burst.start > 5000) {
      beginStep(lastSel);
      burst = { start: now, last: now };
    } else burst.last = now;
    if (/^insert(LineBreak|Paragraph|FromPaste|FromDrop)$|^deleteBy(Cut|Drag)$/.test(e.inputType)) burst = null;

    const d = diffRange(prevText, ta.value, ta.selectionEnd);
    notes = notes.map((n) => remapRange(n, d));
    flags = remapFlags(flags, prevText, ta.value, ta.selectionEnd);
    prevText = ta.value;
    paint();
    if (fb) refreshFind(false);
    markDirty();
    savePos();
    closeCard();
    hideChip();
    document.body.classList.add('typing');
    if (!bar.isConnected) showBar(); // focus 이벤트를 놓친 경우 대비
    updateBar();
    if (e.inputType === 'insertLineBreak' && matchMedia('(pointer: coarse)').matches) {
      hintOnce('swipe', '팁: 줄을 오른쪽으로 밀면 대사, 왼쪽으로 밀면 생각이 돼요. 따옴표는 여백에 표시돼요.');
    }
  });
  const wake = () => document.body.classList.remove('typing');
  top.addEventListener('pointerdown', wake);
  window.addEventListener('touchmove', wake, { passive: true });
  window.addEventListener('scroll', savePos, { passive: true });

  // ---- 대사 줄: 스와이프 (PC는 Ctrl+' / Ctrl+Shift+') ----
  // 따옴표는 글자가 아니라 줄 표시라서, 커서 이동이나 지우기에 걸리적거리지 않는다.
  const curLine = () => {
    let n = 0;
    const v = ta.value, end = ta.selectionStart;
    for (let k = v.indexOf('\n'); k >= 0 && k < end; k = v.indexOf('\n', k + 1)) n++;
    return n;
  };
  // 줄 i의 표시를 next(0 | 'd' | 's')로. 글자로 쳐 둔 따옴표가 있으면 떼어 내고 표시로 바꾼다.
  function applyFlag(i, next) {
    const line = lineText(i);
    const st = quoteState(line);
    if (next && st === 'mixed') { toast('대사와 지문이 섞인 줄은 그대로 둘게요.'); return false; }
    if ((flags[i] || 0) === next && st !== 'quoted') return false;
    asOneStep(() => {
      if (st === 'quoted') {
        const start = ta.value.split('\n').slice(0, i).reduce((n, l) => n + l.length + 1, 0);
        ta.setRangeText(unquote(line)[0], start, start + line.length, 'preserve');
        ta.dispatchEvent(new Event('input'));
      }
      flags[i] = next;
      paint();
      markDirty();
    });
    return true;
  }
  // 버튼·단축키: 같은 종류면 풀고, 아니면 그 종류로 (빈 줄에 먼저 켜 두고 써도 된다)
  const toggleFlag = (flag) => { const i = curLine(); applyFlag(i, flags[i] === flag ? 0 : flag); };
  // 스와이프: 표시가 있으면 어느 쪽이든 풀고, 없으면 오른쪽 대사·왼쪽 생각
  function plan(i, dir) {
    if (flags[i]) return { label: '풀기', ok: true };
    if (quoteState(lineText(i)) === 'mixed') return { label: '—', ok: false };
    return { label: quoteChars(dir > 0 ? 'd' : 's').join(' '), ok: true };
  }
  lineSwipe({
    ta, backdrop, wrap, plan,
    render: lineHTML,
    commit: (i, dir) => (applyFlag(i, flags[i] ? 0 : dir > 0 ? 'd' : 's') ? lineHTML(i) : null),
    onStart: () => { closeCard(); hideChip(); wake(); },
  });
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.code !== 'Quote') return;
    e.preventDefault();
    toggleFlag(e.shiftKey ? 's' : 'd');
  });

  // 복사·잘라내기: 대사 줄은 진짜 따옴표를 붙여서 내보낸다.
  function clipText(a, b) {
    const lines = ta.value.split('\n');
    const out = [];
    let pos = 0, touched = false;
    lines.forEach((line, i) => {
      const s = pos, e = pos + line.length;
      pos = e + 1;
      if (e < a || s > b || (s === b && b > a)) return;
      let piece = line.slice(Math.max(a, s) - s, Math.min(b, e) - s);
      if (flags[i] && line.trim() && piece) {
        touched = true;
        if (a <= s && b >= e) piece = wrapLine(line, flags[i]);
        else {
          const [o, c] = quoteChars(flags[i]);
          if (a <= s) piece = o + piece;
          if (b >= e) piece += c;
        }
      }
      out.push(piece);
    });
    return touched ? out.join('\n') : null;
  }
  const onClip = (cut) => (e) => {
    const a = ta.selectionStart, b = ta.selectionEnd;
    if (a === b) return;
    const text = clipText(a, b);
    if (text == null) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
    if (cut) asOneStep(() => {
      if (!document.execCommand('delete')) { ta.setRangeText('', a, b, 'start'); ta.dispatchEvent(new Event('input')); }
    });
  };
  ta.addEventListener('copy', onClip(false));
  ta.addEventListener('cut', onClip(true));

  // 붙여넣기: 한 줄 전체가 따옴표로 감싸져 있으면 대사 줄로 바꿔서 넣는다.
  ta.addEventListener('paste', (e) => {
    const raw = e.clipboardData?.getData('text/plain');
    if (!raw) return;
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    const atStart = a === 0 || v[a - 1] === '\n';
    const atEnd = b === v.length || v[b] === '\n';
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    const got = [];
    const cleaned = lines.map((l, k) => {
      const whole = (k > 0 || atStart) && (k < lines.length - 1 || atEnd);
      if (!whole || quoteState(l) !== 'quoted') return l;
      const [t, f] = unquote(l);
      got.push([k, f]);
      return t;
    });
    if (!got.length) return;
    e.preventDefault();
    const text = cleaned.join('\n');
    const L = v.slice(0, a).split('\n').length - 1;
    asOneStep(() => {
      if (!document.execCommand('insertText', false, text)) {
        ta.setRangeText(text, a, b, 'end');
        ta.dispatchEvent(new Event('input'));
      }
      for (const [k, f] of got) flags[L + k] = f;
      paint();
      markDirty();
    });
  });

  // ---- 이 화에서 찾기 ----
  let fb = null; // { box, input, count, all, q, hits, cur }
  function openFind(q = '', targetIndex = null) {
    if (!fb) {
      const input = h('input', { class: 'find-input', type: 'search', placeholder: '이 화에서 찾기', enterkeyhint: 'search', 'aria-label': '이 화에서 찾기' });
      const cnt = h('span', { class: 'find-count' });
      const all = h('button', {
        class: 'find-all',
        onclick: () => { setSearchQuery(fb.q); go(`/w/${wid}/search`); },
      }, '작품 전체에서 찾기', icon('chev'));
      const box = h('div', { class: 'findbox' },
        h('div', { class: 'findbar' },
          input, cnt,
          iconBtn('up', '이전', () => step(-1)),
          iconBtn('down', '다음', () => step(1)),
          iconBtn('close', '찾기 닫기', closeFind)),
        all);
      input.addEventListener('input', () => { fb.q = input.value; refreshFind(true); });
      input.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
        if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
      });
      top.append(box);
      fb = { box, input, count: cnt, all, q: '', hits: [], cur: -1, release: interceptBack(closeFind) };
    }
    fb.input.value = fb.q = q;
    refreshFind(true, targetIndex);
    if (targetIndex == null) setTimeout(() => fb?.input.focus(), 30);
  }
  function refreshFind(pick, targetIndex = null) {
    fb.hits = findAll(ta.value, fb.q);
    if (!fb.hits.length) fb.cur = -1;
    else if (pick) {
      const at = targetIndex ?? ta.selectionStart;
      const k = fb.hits.findIndex((x) => x.index >= at);
      fb.cur = k < 0 ? 0 : k;
    } else fb.cur = Math.max(0, Math.min(fb.cur, fb.hits.length - 1));
    paintFind();
    if (pick) revealCur();
  }
  function paintFind() {
    const has = !!fb?.q.trim();
    findLayer.innerHTML = has ? findHTML(ta.value, fb.q, fb.cur) : '';
    if (!fb) return;
    fb.count.textContent = !has ? '' : fb.hits.length ? `${fb.cur + 1}/${fb.hits.length}` : '없음';
    fb.all.hidden = !has;
  }
  function step(d) {
    if (!fb?.hits.length) return;
    fb.cur = (fb.cur + d + fb.hits.length) % fb.hits.length;
    paintFind();
    revealCur();
  }
  function revealCur() {
    const m = findLayer.querySelector('mark.cur');
    if (!m) return;
    const vv = window.visualViewport;
    const vh = vv ? vv.height : window.innerHeight;
    const headerBottom = top.getBoundingClientRect().bottom;
    const target = (vv ? vv.offsetTop : 0) + headerBottom + (vh - headerBottom) * 0.3;
    window.scrollBy(0, m.getBoundingClientRect().top - target);
  }
  function closeFind() {
    if (!fb) return;
    const hit = fb.hits[fb.cur];
    if (hit) ta.setSelectionRange(hit.index, hit.index + hit.len);
    fb.box.remove();
    fb.release();
    fb = null;
    findLayer.innerHTML = '';
  }
  const onKeyFind = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      openFind(sel && !sel.includes('\n') ? sel : fb?.q || '');
    }
  };
  document.addEventListener('keydown', onKeyFind);

  // ---- 이름 탭 → 설정 카드 ----
  const markAt = (x, y) => document.elementsFromPoint(x, y).find((n) => n.tagName === 'MARK' && backdrop.contains(n));
  const noteAt = (x, y) => document.elementsFromPoint(x, y).find((n) => n.classList?.contains('nt') && notesLayer.contains(n));
  // 탭한 자리: 주석이면 주석 카드, 이름이면 설정 카드.
  // 주석과 이름이 겹쳤거나, 같은 별명을 여러 캐릭터가 쓰면 고르는 카드.
  function hitAt(x, y) {
    const n = noteAt(x, y);
    const m = markAt(x, y);
    const ids = m ? m.dataset.id.split(',') : [];
    const count = (n ? 1 : 0) + ids.length;
    if (!count) return null;
    if (count === 1) return n ? () => openNote(n.dataset.note) : () => openCard(ids[0]);
    return () => openChoice(n?.dataset.note, ids, m?.textContent);
  }
  let t0 = null;
  let lastTouch = 0;
  ta.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    t0 = { x: t.clientX, y: t.clientY, at: Date.now() };
  }, { passive: true });
  ta.addEventListener('touchend', (e) => {
    const start = t0;
    t0 = null;
    lastTouch = Date.now();
    if (!start) return;
    const t = e.changedTouches[0];
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10 || Date.now() - start.at > 450) return;
    const act = hitAt(t.clientX, t.clientY);
    if (!act) { closeCard(); return; }
    // 읽는 중(키보드 없음)이면 키보드를 띄우지 않고 카드만 연다.
    if (document.activeElement !== ta) e.preventDefault();
    act();
  });
  ta.addEventListener('mousedown', (e) => {
    if (Date.now() - lastTouch < 800 || document.activeElement === ta) return;
    const act = hitAt(e.clientX, e.clientY);
    if (act) { e.preventDefault(); act(); }
  });
  ta.addEventListener('click', (e) => {
    if (Date.now() - lastTouch < 800 || ta.selectionStart !== ta.selectionEnd) return;
    const act = hitAt(e.clientX, e.clientY);
    act ? act() : closeCard();
  });

  let card = null;
  let releaseCard = null;
  // 키보드가 떠 있을 때 이름을 탭하면, 그 탭의 클릭이 방금 뜬 카드 위에 떨어져
  // 값 고치기나 연결된 이름이 저절로 눌린다. 카드 위에서 시작한 누름만 받는다.
  function showCard() {
    let armed = false;
    const shownAt = Date.now();
    // 카드가 뜬 뒤 새로 누른 것만 (손가락을 떼기 전의 입력, 너무 빠른 연타는 무시)
    card.addEventListener('pointerdown', () => { armed = Date.now() - shownAt > 350; }, true);
    card.addEventListener('click', (ev) => {
      if (!armed) { ev.stopPropagation(); ev.preventDefault(); }
      armed = false;
    }, true);
    document.body.append(card);
  }
  function closeCard() {
    card?.remove();
    card = null;
    releaseCard?.();
    releaseCard = null;
  }
  function openCard(id) {
    const c = db.entries.get(id);
    if (!c) return;
    closeCard();
    wake();
    save.flush(); // 등장 화 계산이 방금 쓴 문장까지 보도록
    const t = typeOf(c.type, wid);
    const isChar = c.type === 'character';
    const order = orderOf(wid);
    const at = order.get(cid) ?? Infinity;
    const rows = c.fields
      .map((f) => {
        const v = valueAt(f, at, order);
        const here = v.rec?.chapterId === cid;
        return { f, v, here, prev: here ? valueAt(f, at - 1, order).value : null };
      })
      .filter(({ f, v, here }) => f.label.trim() && (v.value.trim() || here));
    const facts = [...rows.filter((r) => r.here), ...rows.filter((r) => !r.here)].slice(0, 6);
    const apps = isChar ? appearances(c) : [];
    const editFact = async (f) => { if (await factSheet(c, f, { cid })) openCard(c.id); };
    // 관계는 이 화에 같이 나온 사람과의 것만 (다 보여 주면 카드가 넘친다)
    const present = new Set([...backdrop.querySelectorAll('mark')].flatMap((m) => m.dataset.id.split(',')));
    const rels = isChar ? relationsOf(c.id)
      .map((r) => {
        const o = db.entries.get(otherOf(r, c.id));
        const [mine, theirs] = sidesFor(r, c.id);
        const m = valueAt(mine, at, order), t = valueAt(theirs, at, order);
        return { r, o, mine, m, t, here: m.rec?.chapterId === cid || t.rec?.chapterId === cid };
      })
      .filter((x) => x.o && present.has(x.o.id) && (x.m.value.trim() || x.t.value.trim()))
      .sort((a, b) => b.here - a.here)
      .slice(0, 4) : [];
    const editRel = async ({ r, o, mine }) => {
      if (await factSheet(r, mine, { cid, title: `${c.name} → ${o.name}` })) openCard(c.id);
    };
    const relNode = rels.length ? h('div', { class: 'peek-rels' },
      h('div', { class: 'peek-sub' }, '이 화의 관계'),
      h('dl', { class: 'peek-facts' }, rels.map((x) => [
        h('dt', { class: x.here ? 'changed' : null, onclick: () => openCard(x.o.id) },
          h('span', { class: 'dot', style: `--c:${x.o.color}` }), x.o.name,
          x.here ? h('span', { class: 'new-dot', title: '이 화에서 바뀜', 'aria-label': '이 화에서 바뀜' }) : null),
        h('dd', { onclick: () => editRel(x) },
          x.m.value.trim() || h('span', { class: 'muted' }, `${x.o.name}${josa(x.o.name, '이', '가')} 보기엔: ${x.t.value.trim()}`)),
      ]))) : null;
    // 연결된 목록의 이름은 형광펜처럼, 누르면 그 설정 카드로
    const valueNode = (f, text) => {
      const link = linkOf(f);
      if (!link) return text;
      return linkParts(text, namedOfType(wid, link)).map((p) => (p.e
        ? h('mark', { class: 'lk', style: `--c:${p.e.color || 'var(--accent)'}`, onclick: (ev) => { ev.stopPropagation(); openCard(p.e.id); } }, p.t)
        : p.t));
    };
    card = h('div', { class: 'peek', style: `--c:${c.color || 'var(--accent)'}`, role: 'dialog', 'aria-label': c.name + ' 설정' },
      h('div', { class: 'peek-head' },
        isChar ? h('span', { class: 'dot' }) : icon(iconOf(c), 'type-ic'),
        h('div', { class: 'peek-name' },
          h('b', null, c.name),
          h('span', { class: 'peek-alias' }, isChar ? c.aliases.join(' · ') : t.label)),
        h('button', { class: 'icon-btn sm', 'aria-label': '닫기', onclick: closeCard }, icon('close'))),
      facts.length
        ? h('dl', { class: 'peek-facts' }, facts.map(({ f, v, here, prev }) => {
          const since = v.rec && !here ? db.chapters.get(v.rec.chapterId)?.title : null;
          return [
            // 이 화에서 바뀐 항목은 이름 옆에 알림처럼 초록 점
            h('dt', { class: here ? 'changed' : null, onclick: () => editFact(f) }, f.label,
              here ? h('span', { class: 'new-dot', title: '이 화에서 바뀜', 'aria-label': '이 화에서 바뀜' }) : null),
            h('dd', { class: here ? 'changed' : null, onclick: () => editFact(f) },
              here ? [h('span', { class: 'fact-prev' }, prev || '(없음)'), h('span', { class: 'fact-arrow' }, ' → ')] : null,
              valueNode(f, v.value) || (here ? '(비움)' : ''),
              since ? h('span', { class: 'fact-tag' }, `${since}부터`) : null),
          ];
        }))
        : h('p', { class: 'peek-empty' }, '아직 적어둔 설정이 없어요.'),
      relNode,
      facts.length && firstTime('card-edit') ? h('p', { class: 'peek-hint' }, '값을 탭하면 바로 고치거나, 이 화부터 바뀐 것으로 기록할 수 있어요.') : null,
      h('div', { class: 'peek-foot' },
        h('span', { class: 'muted' }, apps.length ? `${apps.length}개 화에 등장` : ''),
        h('button', { class: 'link-btn', onclick: () => { setViewAt(wid, cid); go(`/w/${wid}/e/${c.id}`); } }, facts.length ? '전체 설정' : '설정 적기', icon('chev'))));
    card.addEventListener('pointerdown', (e) => { if (e.target.closest('button, mark') == null) e.preventDefault(); });
    showCard();
    releaseCard = interceptBack(closeCard);
    if (isChar) emit('card-opened');
  }

  // 처음 한 번만 (카드 안에 넣는 안내용)
  function firstTime(key) {
    try {
      if (localStorage.getItem('ll:hint:' + key)) return false;
      localStorage.setItem('ll:hint:' + key, '1');
      return true;
    } catch { return false; }
  }

  // 한 자리에 볼 것이 여러 개일 때 (주석 + 이름, 또는 같은 별명의 여러 캐릭터)
  function openChoice(noteId, entryIds, word) {
    const n = noteId ? notes.find((x) => x.id === noteId) : null;
    const chars = entryIds.map((id) => db.entries.get(id)).filter(Boolean);
    closeCard();
    wake();
    card = h('div', { class: 'peek choice-card', role: 'dialog', 'aria-label': '무엇을 볼까요?' },
      word && chars.length > 1 ? h('div', { class: 'choice-head' }, `‘${word}’${josa(word, '은', '는')} 여러 명이 쓰는 이름이에요`) : null,
      n ? h('button', { class: 'choice-row', onclick: () => openNote(noteId) },
        icon('note', 'note-ic'),
        h('span', { class: 'choice-text' }, h('b', null, '주석'), h('span', { class: 'muted' }, clip(n.text, 30))),
        icon('chev', 'chev')) : null,
      chars.map((c) => h('button', { class: 'choice-row', style: `--c:${c.color}`, onclick: () => openCard(c.id) },
        h('span', { class: 'dot' }),
        h('span', { class: 'choice-text' }, h('b', null, c.name),
          h('span', { class: 'muted' }, c.aliases.length ? c.aliases.join(' · ') : '캐릭터 설정')),
        icon('chev', 'chev'))));
    card.addEventListener('pointerdown', (e) => { if (e.target.closest('button') == null) e.preventDefault(); });
    showCard();
    releaseCard = interceptBack(closeCard);
  }

  // ---- 주석 ----
  const clip = (s, n = 26) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  function openNote(id) {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    closeCard();
    wake();
    const quoted = n.end > n.start ? clip(ta.value.slice(n.start, n.end), 30) : '';
    card = h('div', { class: 'peek note-card', role: 'dialog', 'aria-label': '주석' },
      h('div', { class: 'peek-head' },
        icon('note', 'note-ic'),
        h('div', { class: 'peek-name' },
          h('b', null, '주석'),
          h('span', { class: 'peek-alias' }, quoted ? `‘${quoted}’` : '달려 있던 글이 지워졌어요')),
        h('button', { class: 'icon-btn sm', 'aria-label': '닫기', onclick: closeCard }, icon('close'))),
      h('p', { class: 'note-text' }, n.text),
      h('div', { class: 'peek-foot' },
        h('button', { class: 'link-btn danger', onclick: () => removeNote(id) }, '지우기'),
        h('button', { class: 'link-btn', onclick: () => editNote(id) }, '고치기', icon('chev'))));
    card.addEventListener('pointerdown', (e) => { if (e.target.closest('button') == null) e.preventDefault(); });
    showCard();
    releaseCard = interceptBack(closeCard);
  }
  async function addNote(s, e) {
    hideChip();
    const text = await askLong('주석 달기', { placeholder: '이 부분에 대한 메모', note: `‘${clip(ta.value.slice(s, e), 40)}’` });
    if (!text) return;
    asOneStep(() => {
      notes.push({ id: uid(), start: s, end: e, text, createdAt: Date.now() });
      paint();
      markDirty();
    });
    ta.setSelectionRange(e, e);
    hintOnce('note', '밑줄을 탭하면 주석을 다시 볼 수 있어요. 원고로 내보낼 땐 빠져요.');
  }
  async function editNote(id) {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    closeCard();
    const text = await askLong('주석 고치기', { value: n.text });
    if (text == null) return;
    if (!text) { removeNote(id); return; }
    asOneStep(() => {
      notes = notes.map((x) => (x.id === id ? { ...x, text } : x));
      paint();
      markDirty();
    });
    openNote(id);
  }
  function removeNote(id) {
    closeCard();
    asOneStep(() => {
      notes = notes.filter((x) => x.id !== id);
      paint();
      markDirty();
    });
    toast('주석을 지웠어요.', { action: '되돌리기', onAction: undo, duration: 5000 });
  }
  function notesSheet() {
    const list = [...notes].sort((a, b) => a.start - b.start);
    actions(list.map((n) => ({
      label: h('span', { class: 'note-row' },
        h('span', { class: 'muted small' }, n.end > n.start ? `‘${clip(ta.value.slice(n.start, n.end))}’` : '지워진 글'),
        h('span', null, n.text)),
      run: () => {
        notesLayer.querySelector(`[data-note="${n.id}"]`)?.scrollIntoView({ block: 'center' });
        openNote(n.id);
      },
    })), `주석 ${list.length}개`);
  }

  // ---- 설정 보기: 쓰던 화면을 벗어나지 않고 이 화 시점의 설정을 둘러본다 ----
  // 위에는 이 화에서 바뀐 것(종류별로 모아서), 아래는 전체. 누르면 카드가 뜨고 거기서 바로 고친다.
  function settingsSheet() {
    const changed = new Map(); // entry → 바뀐 항목 이름들
    for (const { entry, field } of changesIn(wid, cid)) {
      const list = changed.get(entry) || [];
      if (!list.includes(field.label)) list.push(field.label);
      changed.set(entry, list);
    }
    const row = (e, sub, tag) => ({
      label: h('span', { class: 'set-row' },
        e.color ? h('span', { class: 'dot', style: `--c:${e.color}` }) : icon(iconOf(e), 'type-ic'),
        h('span', { class: 'set-name' }, e.name),
        sub ? h('span', { class: 'muted small set-sub' }, sub) : null,
        tag ? h('span', { class: 'fact-tag here' }, tag) : null),
      run: () => openCard(e.id),
    });
    const items = [];
    if (changed.size) {
      items.push({ info: true, label: h('span', { class: 'set-head' }, `${ch.title}에서 바뀐 것`) });
      for (const t of typesOf(wid)) for (const [e, labels] of changed) if (e.type === t.key) items.push(row(e, labels.join(', '), t.label));
    }
    for (const t of typesOf(wid)) {
      const list = namedOfType(wid, t.key).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      if (!list.length) continue;
      items.push({ info: true, label: h('span', { class: 'set-head' }, t.label) });
      for (const e of list) items.push(row(e, e.type === 'character' ? e.aliases.join(', ') : ''));
    }
    if (!items.length) items.push({ info: true, label: '아직 설정이 없어요. 본문의 이름을 길게 눌러 선택하면 캐릭터로 바로 등록할 수 있어요.' });
    items.push({ label: '설정 화면에서 크게 보기 ›', run: () => { setViewAt(wid, cid); go(`/w/${wid}/lore`); } });
    actions(items, `설정 · ${ch.title} 시점`);
  }

  // ---- 단어 선택 → 캐릭터로 등록 ----
  let chip = null;
  function hideChip() { chip?.remove(); chip = null; }
  function onSelect() {
    if (document.activeElement !== ta) return;
    updateBar();
    const s = ta.selectionStart, e = ta.selectionEnd;
    const word = ta.value.slice(s, e).trim();
    if (e <= s || !word) { hideChip(); return; }
    const key = s + ':' + e;
    if (chip?.dataset.key === key) return;
    hideChip();
    const canChar = word.length <= 20 && !/\n/.test(word) && !matcher?.map.has(word);
    chip = h('div', { class: 'chip-row', 'data-key': key },
      h('button', { class: 'chip-btn', onclick: () => addNote(s, e) }, icon('note'), '주석'),
      canChar ? h('button', { class: 'chip-btn', onclick: () => register(word) }, icon('plus'), `‘${clip(word, 8)}’ 캐릭터로`) : null);
    chip.addEventListener('pointerdown', (ev) => ev.preventDefault());
    document.body.append(chip);
  }
  document.addEventListener('selectionchange', onSelect);
  ta.addEventListener('select', onSelect);

  function register(word) {
    hideChip();
    const c = createEntry(wid, 'character', { name: word });
    matcher = buildMatcher(charactersOf(wid));
    paint();
    emit('character-created');
    toast(`‘${word}’${josa(word, '을', '를')} 캐릭터로 등록했어요.`);
    ta.setSelectionRange(ta.selectionEnd, ta.selectionEnd);
    openCard(c.id);
  }

  // ---- 메뉴 ----
  async function rename() {
    const t = await ask('화 제목', { value: ch.title });
    if (!t) return;
    ch.title = t;
    titleBtn.textContent = t;
    put('chapters', ch);
  }

  function menu() {
    const list = chaptersOf(wid);
    const i = list.findIndex((c) => c.id === cid);
    const prev = list[i - 1], next = list[i + 1];
    const text = manuscriptText(currentChapter());
    const nChanges = new Set(changesIn(wid, cid).map((x) => x.entry)).size;
    actions([
      prev && { label: `‹ 이전 화 · ${prev.title}`, run: () => turnTo(prev, 'right') },
      next
        ? { label: `다음 화 › · ${next.title}`, run: () => turnTo(next, 'left') }
        : { label: '다음 화 쓰기', run: () => turnTo(createChapter(wid), 'left') },
      { label: nChanges ? `설정 보기 · 이 화에서 바뀐 것 ${nChanges}` : '설정 보기', run: settingsSheet },
      notes.length ? { label: `주석 모아 보기 (${notes.length})`, run: notesSheet } : null,
      { label: '제목 바꾸기', run: rename },
      { label: '이 화만 텍스트로 내보내기', run: () => { save.flush(); exportChapter(work, ch); } },
      { info: true, label: `공백 포함 ${num(text.length)}자 · 공백 제외 ${num(text.replace(/\s/g, '').length)}자` },
    ]);
  }

  // ---- 제목을 좌우로 끌어 화 넘기기 ----
  // 오른쪽으로 끌면 이전 화, 왼쪽으로 끌면 다음 화 (책장 넘기는 방향). 탭은 그대로 제목 바꾸기.
  function turnTo(c, from) {
    enterFrom = from;
    go(`/w/${wid}/c/${c.id}`, { replace: true });
  }
  const neighbors = () => {
    const list = chaptersOf(wid);
    const i = list.findIndex((c) => c.id === cid);
    return { prev: list[i - 1], next: list[i + 1] };
  };
  const TURN = 70;
  let drag = null;
  let dragged = false;
  // 처음 댄 손가락 하나만 따라간다 (도중에 다른 손가락이 닿아도 무시)
  titleBtn.addEventListener('pointerdown', (e) => { if (!drag || e.isPrimary) drag = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false }; });
  titleBtn.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      drag.on = true;
      drag.nb = neighbors();
      titleBtn.setPointerCapture?.(drag.id);
      wake();
    }
    const toPrev = dx > 0;
    const target = toPrev ? drag.nb.prev : drag.nb.next;
    const can = toPrev ? !!target : true; // 마지막 화에서 왼쪽은 '다음 화 쓰기'
    const a = Math.min(Math.abs(dx), 140) * (can ? 1 : 0.3); // 갈 곳이 없으면 버틴다
    titleBtn.style.transform = `translateX(${Math.sign(dx) * a}px)`;
    titleBtn.style.opacity = String(1 - Math.min(a / 220, 0.6));
    const peek = toPrev ? peekL : peekR;
    (toPrev ? peekR : peekL).style.opacity = 0;
    peek.textContent = toPrev ? (target ? `‹ ${target.title}` : '첫 화예요') : (target ? `${target.title} ›` : '＋ 다음 화 쓰기');
    peek.style.opacity = String(Math.min(1, Math.abs(dx) / TURN));
    const ready = can && Math.abs(dx) >= TURN;
    if (ready !== drag.ready) { peek.classList.toggle('ready', ready); if (ready) navigator.vibrate?.(8); }
    drag.dx = dx;
    drag.ready = ready;
  });
  const endDrag = (e) => {
    if (drag && e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d?.on) return;
    dragged = true;
    setTimeout(() => { dragged = false; }, 80);
    titleBtn.style.transition = 'transform .18s ease-out, opacity .18s';
    titleBtn.style.transform = '';
    titleBtn.style.opacity = '';
    peekL.style.opacity = peekR.style.opacity = 0;
    peekL.classList.remove('ready');
    peekR.classList.remove('ready');
    setTimeout(() => { titleBtn.style.transition = ''; }, 200);
    if (!d.ready) return;
    if (d.dx > 0) turnTo(d.nb.prev, 'right');
    else turnTo(d.nb.next || createChapter(wid), 'left');
  };
  titleBtn.addEventListener('pointerup', endDrag);
  titleBtn.addEventListener('pointercancel', endDrag);
  // 끌고 난 뒤의 클릭은 제목 바꾸기로 치지 않는다
  titleBtn.addEventListener('click', (e) => { if (dragged) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  if (enterFrom) {
    wrap.classList.add('enter-' + enterFrom);
    enterFrom = null;
  }
  if (chaptersOf(wid).length > 1) hintOnce('title-swipe', '위쪽 제목을 좌우로 밀면 이전 화·다음 화로 넘어가요.');

  // ---- 첫 표시 & 위치 복구 ----
  paint();
  updateCount(); updateCount.flush(); // 처음 글자 수는 바로
  setTimeout(() => {
    if (jump && jump.cid === cid) {
      const { index, len, find } = jump;
      jump = null;
      if (find) { openFind(find, index); return; }
      const m = backdrop.querySelector(`mark[data-i="${index}"]`);
      if (m) {
        m.scrollIntoView({ block: 'center' });
        m.classList.add('flash');
        setTimeout(() => m.classList.remove('flash'), 1800);
      }
      ta.setSelectionRange(index + len, index + len);
      return;
    }
    const pos = loadPos(cid);
    if (pos) {
      window.scrollTo(0, pos.y);
      ta.setSelectionRange(pos.sel, pos.sel);
    } else if (!ta.value) {
      ta.focus();
    }
  }, 0);
  if (matcher) hintOnce('editor-tap', '색칠된 이름을 탭하면 그 캐릭터의 설정이 떠요.');

  const flush = () => { save.flush(); savePos.flush(); };
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);

  el.cleanup = () => {
    flush();
    closeCard();
    hideChip();
    wake();
    clearTimeout(barTimer);
    bar.remove();
    document.documentElement.style.removeProperty('--bar');
    document.removeEventListener('selectionchange', onSelect);
    document.removeEventListener('visibilitychange', onHide);
    document.removeEventListener('keydown', onKeyFind);
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('touchmove', wake);
    window.removeEventListener('scroll', savePos);
  };
  return el;
}
