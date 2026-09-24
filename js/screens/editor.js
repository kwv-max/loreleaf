// 글쓰기 화면. 쓰는 동안엔 글만 보이게: 얇은 상단바 하나, 나머지는 필요할 때만 뜬다.
//
// 구조: 표시용 레이어(.ed-backdrop) 위에 투명 배경 textarea를 겹친다.
// 형광펜은 뒤 레이어에만 그려지므로 원고 텍스트에는 어떤 서식도 들어가지 않는다.
import { h, icon, iconBtn, debounce, num, toast, actions, ask, hintOnce, josa } from '../ui.js';
import { db, put, chaptersOf, charactersOf, createChapter, createEntry, stashDraft, clearDraft, touchWork, typeOf } from '../store.js';
import { buildMatcher, highlightHTML, appearances } from '../highlight.js';
import { go, back } from '../router.js';
import { emit } from '../guide.js';
import { lineSwipe } from '../swipe.js';
import { toggleQuote } from '../quotes.js';

let jump = null; // 다른 화면에서 "이 위치로 가서 보여줘" 요청
export function setJump(cid, index, len) { jump = { cid, index, len }; }

const posKey = (cid) => 'll:pos:' + cid;
const loadPos = (cid) => { try { return JSON.parse(localStorage.getItem(posKey(cid)) || 'null'); } catch { return null; } };

export function editorScreen({ wid, cid }) {
  const work = db.works.get(wid);
  const ch = db.chapters.get(cid);
  if (!work || !ch) { go('/', { replace: true }); return null; }

  if (work.lastChapterId !== cid) { work.lastChapterId = cid; put('works', work, { touch: false }); }

  let matcher = buildMatcher(charactersOf(wid));
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ---- 상단바 ----
  const titleBtn = h('button', { class: 'topbar-title as-btn', onclick: rename }, ch.title);
  const count = h('span', { class: 'ed-count' });
  const top = h('header', { class: 'topbar ed-top' },
    h('div', { class: 'topbar-row' },
      iconBtn('back', '뒤로', () => back('/w/' + wid)),
      titleBtn,
      count,
      iconBtn('book', '등장인물', peopleSheet),
      iconBtn('more', '더 보기', menu)));

  // ---- 본문 ----
  const backdrop = h('div', { class: 'ed-backdrop' + (isIOS ? ' ios' : ''), 'aria-hidden': 'true' });
  const ta = h('textarea', {
    class: 'ed-text',
    placeholder: '여기에 쓰면 돼요. 저장은 알아서 돼요.',
    spellcheck: false, autocomplete: 'off', autocapitalize: 'off',
    'aria-label': '본문',
  });
  ta.value = ch.text;
  const wrap = h('div', { class: 'ed-wrap' }, backdrop, ta);
  const el = h('div', { class: 'screen editor' }, top, wrap);
  el.keepScroll = true;

  // ---- 그리기 ----
  let highlightSeen = false;
  function paint() {
    backdrop.innerHTML = highlightHTML(ta.value, matcher);
    if (!highlightSeen && backdrop.querySelector('mark')) { highlightSeen = true; emit('highlight-shown'); }
  }
  const updateCount = debounce(() => { count.textContent = num(ta.value.length) + '자'; }, 300);

  // ---- 저장 ----
  let dirty = false;
  const save = debounce(() => {
    if (!dirty) return;
    dirty = false;
    ch.text = ta.value;
    put('chapters', ch).then(() => clearDraft(ch.id));
    touchWork(wid);
  }, 600);
  const stash = debounce(() => stashDraft(ch.id, ta.value), 150);
  const savePos = debounce(() => {
    try { localStorage.setItem(posKey(cid), JSON.stringify({ sel: ta.selectionStart, y: window.scrollY })); } catch {}
  }, 300);

  ta.addEventListener('input', (e) => {
    dirty = true;
    paint();
    save();
    stash();
    savePos();
    updateCount();
    closeCard();
    hideChip();
    document.body.classList.add('typing');
    if (e.inputType === 'insertLineBreak' && matchMedia('(pointer: coarse)').matches) {
      hintOnce('swipe', '팁: 줄을 오른쪽으로 밀면 “대사”, 왼쪽으로 밀면 ‘생각’이 돼요.');
    }
  });
  const wake = () => document.body.classList.remove('typing');
  top.addEventListener('pointerdown', wake);
  window.addEventListener('touchmove', wake, { passive: true });
  window.addEventListener('scroll', savePos, { passive: true });

  // ---- 따옴표: 줄 스와이프 (PC는 Ctrl+' / Ctrl+Shift+') ----
  const replaceLine = (start, end, text) => {
    ta.setRangeText(text, start, end, 'preserve');
    ta.dispatchEvent(new Event('input'));
  };
  lineSwipe({
    ta, backdrop, wrap,
    render: (text) => highlightHTML(text, matcher),
    apply: replaceLine,
    onStart: () => { closeCard(); hideChip(); wake(); },
  });
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.code !== 'Quote') return;
    e.preventDefault();
    const v = ta.value;
    const start = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let end = v.indexOf('\n', ta.selectionStart);
    if (end < 0) end = v.length;
    const next = toggleQuote(v.slice(start, end), e.shiftKey ? -1 : 1);
    if (next == null) { if (v.slice(start, end).trim()) toast('대사와 지문이 섞인 줄은 그대로 둘게요.'); return; }
    replaceLine(start, end, next);
  });

  // ---- 이름 탭 → 설정 카드 ----
  const markAt = (x, y) => document.elementsFromPoint(x, y).find((n) => n.tagName === 'MARK' && backdrop.contains(n));
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
    const m = markAt(t.clientX, t.clientY);
    if (!m) { closeCard(); return; }
    // 읽는 중(키보드 없음)이면 키보드를 띄우지 않고 카드만 연다.
    if (document.activeElement !== ta) e.preventDefault();
    openCard(m.dataset.id);
  });
  ta.addEventListener('mousedown', (e) => {
    if (Date.now() - lastTouch < 800 || document.activeElement === ta) return;
    const m = markAt(e.clientX, e.clientY);
    if (m) { e.preventDefault(); openCard(m.dataset.id); }
  });
  ta.addEventListener('click', (e) => {
    if (Date.now() - lastTouch < 800 || ta.selectionStart !== ta.selectionEnd) return;
    const m = markAt(e.clientX, e.clientY);
    m ? openCard(m.dataset.id) : closeCard();
  });

  let card = null;
  function closeCard() { card?.remove(); card = null; }
  function openCard(id) {
    const c = db.entries.get(id);
    if (!c) return;
    closeCard();
    wake();
    save.flush(); // 등장 화 계산이 방금 쓴 문장까지 보도록
    const facts = c.fields.filter((f) => f.label.trim() && f.value.trim()).slice(0, 5);
    const apps = appearances(c);
    card = h('div', { class: 'peek', style: `--c:${c.color}`, role: 'dialog', 'aria-label': c.name + ' 설정' },
      h('div', { class: 'peek-head' },
        h('span', { class: 'dot' }),
        h('div', { class: 'peek-name' },
          h('b', null, c.name),
          c.aliases.length ? h('span', { class: 'peek-alias' }, c.aliases.join(' · ')) : null),
        h('button', { class: 'icon-btn sm', 'aria-label': '닫기', onclick: closeCard }, icon('close'))),
      facts.length
        ? h('dl', { class: 'peek-facts' }, facts.map((f) => [h('dt', null, f.label), h('dd', null, f.value)]))
        : h('p', { class: 'peek-empty' }, '아직 적어둔 설정이 없어요.'),
      h('div', { class: 'peek-foot' },
        h('span', { class: 'muted' }, apps.length ? `${apps.length}개 화에 등장` : ''),
        h('button', { class: 'link-btn', onclick: () => go(`/w/${wid}/e/${c.id}`) }, facts.length ? '전체 설정' : '설정 적기', icon('chev'))));
    card.addEventListener('pointerdown', (e) => { if (e.target.closest('button') == null) e.preventDefault(); });
    document.body.append(card);
    emit('card-opened');
  }

  // ---- 단어 선택 → 캐릭터로 등록 ----
  let chip = null;
  function hideChip() { chip?.remove(); chip = null; }
  function onSelect() {
    if (document.activeElement !== ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const word = ta.value.slice(s, e).trim();
    if (e <= s || !word || word.length > 20 || /\n/.test(word) || matcher?.map.has(word)) { hideChip(); return; }
    if (chip?.dataset.word === word) return;
    hideChip();
    chip = h('button', { class: 'chip-float', 'data-word': word, onclick: () => register(word) },
      icon('plus'), `‘${word}’ 캐릭터로 등록`);
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
    const text = ta.value;
    actions([
      prev && { label: `‹ 이전 화 · ${prev.title}`, run: () => go(`/w/${wid}/c/${prev.id}`, { replace: true }) },
      next
        ? { label: `다음 화 › · ${next.title}`, run: () => go(`/w/${wid}/c/${next.id}`, { replace: true }) }
        : { label: '다음 화 쓰기', run: () => { const n = createChapter(wid); go(`/w/${wid}/c/${n.id}`, { replace: true }); } },
      { label: '제목 바꾸기', run: rename },
      { info: true, label: `공백 포함 ${num(text.length)}자 · 공백 제외 ${num(text.replace(/\s/g, '').length)}자` },
    ]);
  }

  function peopleSheet() {
    const chars = charactersOf(wid).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (!chars.length) {
      actions([
        { info: true, label: '아직 등록한 캐릭터가 없어요. 본문의 이름을 길게 눌러 선택하면 바로 등록할 수 있어요.' },
        { label: '설정 화면에서 추가하기', run: () => go(`/w/${wid}/lore/character`) },
      ], typeOf('character').label);
      return;
    }
    actions(chars.map((c) => ({
      label: h('span', { class: 'row-inline' }, h('span', { class: 'dot', style: `--c:${c.color}` }), c.name,
        c.aliases.length ? h('span', { class: 'muted' }, c.aliases.join(', ')) : null),
      run: () => openCard(c.id),
    })), '등장인물');
  }

  // ---- 첫 표시 & 위치 복구 ----
  paint();
  updateCount.flush();
  setTimeout(() => {
    if (jump && jump.cid === cid) {
      const { index, len } = jump;
      jump = null;
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
    document.removeEventListener('selectionchange', onSelect);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('touchmove', wake);
    window.removeEventListener('scroll', savePos);
  };
  return el;
}
