// 줄(문단) 스와이프로 따옴표 붙이기/풀기.
// 오른쪽으로 밀면 “대사”, 왼쪽으로 밀면 ‘생각’, 이미 감싸져 있으면 어느 쪽이든 풀린다.
// 결과는 평범한 텍스트다. 원고에 숨은 표시를 남기지 않는다.
import { h, toast } from './ui.js';
import { quoteState, toggleQuote } from './quotes.js';
import { pref } from './prefs.js';

const THRESHOLD = 64;

// ta 위에서 가로로 미는 동작을 잡아 문단을 끌어당기는 연출을 보여주고, 놓으면 apply를 부른다.
export function lineSwipe({ ta, backdrop, wrap, render, apply, onStart }) {
  let g = null; // 진행 중인 제스처

  function paragraphAt(y) {
    const spans = backdrop.children;
    let lo = 0, hi = spans.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = spans[mid].getBoundingClientRect();
      if (y < r.top - 6) hi = mid - 1;
      else if (y > r.bottom + 6) lo = mid + 1;
      else return spans[mid];
    }
    return null;
  }

  function begin(span) {
    const start = +span.dataset.s;
    let end = ta.value.indexOf('\n', start);
    if (end < 0) end = ta.value.length;
    const text = ta.value.slice(start, end);
    if (!text.trim()) return false;

    const first = span.getClientRects()[0];
    const lh = parseFloat(getComputedStyle(backdrop).lineHeight);
    const top = first.top - wrap.getBoundingClientRect().top - (lh - first.height) / 2;
    const ghost = h('div', { class: 'ed-ghost' + (backdrop.classList.contains('ios') ? ' ios' : ''), 'aria-hidden': 'true' });
    ghost.innerHTML = render(text);
    const left = h('span', { class: 'q left' });
    const right = h('span', { class: 'q right' });
    const cover = h('div', { class: 'ed-cover', 'aria-hidden': 'true' }, left, right);
    ghost.style.top = cover.style.top = top + 'px';
    wrap.append(cover, ghost);
    cover.style.height = ghost.offsetHeight + 'px';
    Object.assign(g, { start, end, text, state: quoteState(text), ghost, cover, left, right, ready: false });
    return true;
  }

  function move(dx) {
    g.dx = dx;
    const a = Math.abs(dx);
    const shown = a <= THRESHOLD ? a : THRESHOLD + (a - THRESHOLD) * 0.3;
    g.ghost.style.transform = `translateX(${Math.sign(dx) * shown}px)`;
    const curly = pref('quotes') === 'curly';
    const side = dx > 0 ? g.left : g.right;
    const other = dx > 0 ? g.right : g.left;
    side.textContent = g.state === 'quoted' ? '풀기' : g.state === 'mixed' ? '—' : dx > 0 ? (curly ? '“ ”' : '" "') : (curly ? '‘ ’' : "' '");
    side.style.opacity = Math.min(1, a / THRESHOLD);
    other.style.opacity = 0;
    const ready = a >= THRESHOLD && g.state !== 'mixed';
    if (ready !== g.ready) {
      g.ready = ready;
      side.classList.toggle('ready', ready);
      if (ready) navigator.vibrate?.(8);
    }
  }

  function finish() {
    const { ghost, cover } = g;
    if (Math.abs(g.dx || 0) >= THRESHOLD) {
      const next = toggleQuote(g.text, Math.sign(g.dx));
      if (next == null) toast('대사와 지문이 섞인 줄은 그대로 둘게요.');
      else { ghost.innerHTML = render(next); apply(g.start, g.end, next); }
    }
    ghost.classList.add('back');
    ghost.style.transform = 'translateX(0)';
    setTimeout(() => { ghost.remove(); cover.remove(); }, 190);
  }

  ta.addEventListener('touchstart', (e) => {
    g = null;
    if (e.touches.length !== 1) return;
    if (document.activeElement === ta && ta.selectionStart !== ta.selectionEnd) return; // 선택 핸들을 끄는 중일 수 있다
    const t = e.touches[0];
    g = { x: t.clientX, y: t.clientY, mode: null };
  }, { passive: true });

  ta.addEventListener('touchmove', (e) => {
    if (!g || g.mode === 'off') return;
    const t = e.touches[0];
    const dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.mode) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { g.mode = 'off'; return; }
      if (Math.abs(dx) < 12) return;
      // 화면 가장자리는 시스템 뒤로 가기 제스처에 양보한다.
      const edge = g.x < 24 || g.x > window.innerWidth - 24;
      const span = !edge && paragraphAt(g.y);
      if (!span || !begin(span)) { g.mode = 'off'; return; }
      g.mode = 'swipe';
      onStart?.();
    }
    e.preventDefault();
    move(dx);
  }, { passive: false });

  ta.addEventListener('touchend', () => { if (g?.mode === 'swipe') finish(); g = null; });
  ta.addEventListener('touchcancel', () => { if (g?.mode === 'swipe') { g.dx = 0; finish(); } g = null; });
}
