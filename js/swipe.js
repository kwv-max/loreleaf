// 줄(문단) 스와이프. 가로로 미는 동안 문단이 손가락을 따라 끌려오고, 놓으면 editor가 정한 동작을 한다.
// 무엇을 할지는 editor가 plan/commit으로 알려준다 (대사 줄 표시, 글자 따옴표 떼기 등).
import { h } from './ui.js';

const THRESHOLD = 64;

/**
 * plan(line, dir)   → { label, ok }  놓으면 무엇이 되는지 (끌 때 드러나는 표시)
 * commit(line, dir) → 새 문단 HTML | null  실제로 적용하고, 돌아가는 복제본에 보여줄 모습
 * render(line)      → 지금 문단 HTML
 */
export function lineSwipe({ ta, backdrop, wrap, render, plan, commit, onStart }) {
  let g = null; // 진행 중인 제스처

  function paragraphAt(y) {
    const blocks = backdrop.children;
    let lo = 0, hi = blocks.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = blocks[mid].getBoundingClientRect();
      if (y < r.top) hi = mid - 1;
      else if (y > r.bottom) lo = mid + 1;
      else return mid;
    }
    return -1;
  }

  function begin(line) {
    const el = backdrop.children[line];
    if (!el || !ta.value.split('\n')[line]?.trim()) return false;
    const top = el.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
    const ghost = h('div', { class: 'ed-ghost', 'aria-hidden': 'true' });
    ghost.innerHTML = render(line);
    const left = h('span', { class: 'q left' });
    const right = h('span', { class: 'q right' });
    const cover = h('div', { class: 'ed-cover', 'aria-hidden': 'true' }, left, right);
    ghost.style.top = cover.style.top = top + 'px';
    cover.style.height = el.offsetHeight + 'px';
    wrap.append(cover, ghost);
    Object.assign(g, { line, ghost, cover, left, right, ready: false });
    return true;
  }

  function move(dx) {
    g.dx = dx;
    const a = Math.abs(dx);
    const shown = a <= THRESHOLD ? a : THRESHOLD + (a - THRESHOLD) * 0.3;
    g.ghost.style.transform = `translateX(${Math.sign(dx) * shown}px)`;
    const p = plan(g.line, Math.sign(dx));
    const side = dx > 0 ? g.left : g.right;
    const other = dx > 0 ? g.right : g.left;
    side.textContent = p.label;
    side.style.opacity = Math.min(1, a / THRESHOLD);
    other.style.opacity = 0;
    const ready = a >= THRESHOLD && p.ok;
    if (ready !== g.ready) {
      g.ready = ready;
      side.classList.toggle('ready', ready);
      if (ready) navigator.vibrate?.(8);
    }
  }

  function finish() {
    const { ghost, cover } = g;
    if (Math.abs(g.dx || 0) >= THRESHOLD) {
      const html = commit(g.line, Math.sign(g.dx));
      if (html != null) ghost.innerHTML = html;
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
      const line = edge ? -1 : paragraphAt(g.y);
      if (line < 0 || !begin(line)) { g.mode = 'off'; return; }
      g.mode = 'swipe';
      onStart?.();
    }
    e.preventDefault();
    move(dx);
  }, { passive: false });

  ta.addEventListener('touchend', () => { if (g?.mode === 'swipe') finish(); g = null; });
  ta.addEventListener('touchcancel', () => { if (g?.mode === 'swipe') { g.dx = 0; finish(); } g = null; });
}
