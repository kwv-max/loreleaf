// 작은 DOM 도우미와 공용 UI(시트, 토스트, 입력창).
import { interceptBack } from './router.js';
import { t, lang } from './i18n.js';
export { josa } from './josa.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const PATHS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
  gem: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  leaf: '<path d="M5 19C5 10 11 5 20 4c0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
  grip: '<path d="M5 9h14M5 15h14"/>',
  // 설정 분류·항목에 고를 수 있는 아이콘
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 19c.8-3.5 3-5 6-5s5.2 1.5 6 5"/><path d="M16 5.5a3 3 0 0 1 0 5.5M17.5 14c2 .5 3 2 3.5 5"/>',
  sword: '<path d="M19 4l1 1-11 11-1-1z"/><path d="M6 13l5 5M7.5 16.5L4 20"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/>',
  crown: '<path d="M4 18h16M4 18L3 7l5 4 4-6 4 6 5-4-1 11"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
  ring: '<circle cx="12" cy="14" r="6"/><path d="M9.5 4h5L16 6.5 12 9 8 6.5z"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
  scroll: '<path d="M8 4h10v13a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2v-2h9v2a2 2 0 0 0 2 2"/><path d="M8 4a2 2 0 0 0-2 2v10M11 9h4M11 12h4"/>',
  mask: '<path d="M3 8c3-1.5 6-2 9-1 3-1 6-.5 9 1 0 6-3 10-6 10-1.5 0-2-1.5-3-1.5S10.5 18 9 18c-3 0-6-4-6-10z"/><path d="M7 11.5c1-.8 2-.8 3 0M14 11.5c1-.8 2-.8 3 0"/>',
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  hammer: '<path d="M14 4l6 6-3 3-6-6z"/><path d="M11 9l-7 7 3 3 7-7"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M19 3v4M17 5h4"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  flame: '<path d="M12 21c-3.9 0-7-2.7-7-6.5 0-3.5 3-5.5 4-9 2 1.5 3 3.5 3 5.5 1-.5 2-2 2-3 2 1.5 5 4 5 6.5 0 3.8-3.1 6.5-7 6.5z"/>',
  drop: '<path d="M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  skull: '<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1 4 2.5 5v3h9v-3c1.5-1 2.5-2.5 2.5-5a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="11" r="1.5"/><circle cx="14.5" cy="11" r="1.5"/><path d="M10 18v3M14 18v3"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  tree: '<path d="M12 21v-5M12 3l-6 8h3l-4 5h14l-4-5h3z"/>',
  mountain: '<path d="M3 19l6-10 4 6 2-3 6 7z"/>',
  house: '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  castle: '<path d="M4 20V7h3v3h3V7h4v3h3V7h3v13z"/><path d="M10 20v-4a2 2 0 0 1 4 0v4"/>',
  ship: '<path d="M3 16h18l-2.5 4h-13z"/><path d="M12 16V3l6 10h-6"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  paw: '<circle cx="7" cy="10" r="1.8"/><circle cx="10.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12 12c-3 0-5 3.5-5 5.5 0 1.5 1.2 2.5 2.5 2.5 1 0 1.5-.5 2.5-.5s1.5.5 2.5.5c1.3 0 2.5-1 2.5-2.5 0-2-2-5.5-5-5.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  speech: '<path d="M4 5h16v11H9l-5 4z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
};
// 고를 수 있는 아이콘 (순서대로 보여 준다)
export const PICK_ICONS = [
  'person', 'people', 'crown', 'mask', 'skull', 'paw', 'heart', 'eye',
  'pin', 'map', 'house', 'castle', 'tree', 'mountain', 'ship', 'globe',
  'gem', 'sword', 'shield', 'key', 'ring', 'coin', 'flask', 'hammer',
  'sparkle', 'bolt', 'flame', 'drop', 'moon', 'sun', 'star', 'cloud',
  'flag', 'book', 'scroll', 'note', 'speech', 'calendar', 'clock', 'music', 'leaf',
];
export function icon(name, cls = '') {
  const s = h('span', { class: 'ic ' + cls, 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || PATHS.note}</svg>`;
  return s;
}

export const iconBtn = (name, label, onclick) => h('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick }, icon(name));

export function topbar({ onBack, title, right = [] }) {
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-row' },
      onBack ? iconBtn('back', t('common.back'), onBack) : null,
      h('div', { class: 'topbar-title' + (onBack ? '' : ' brand') }, title),
      right));
}

export const esc =(s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  // 기다리는 저장이 있을 때만 바로 실행 (없으면 아무것도 안 한다)
  d.flush = (...a) => { if (t == null) return; clearTimeout(t); t = null; fn(...a); };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}

// '방금', '3분 전', '9월 21일' — 언어에 맞는 모양은 브라우저가 만든다
export function relTime(when) {
  const s = (Date.now() - when) / 1000;
  if (s < 60) return t('time.justNow');
  const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: 'always' });
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  if (s < 86400 * 7) return rtf.format(-Math.floor(s / 86400), 'day');
  return new Intl.DateTimeFormat(lang(), { month: 'long', day: 'numeric' }).format(new Date(when));
}

export const num = (n) => n.toLocaleString(lang());

export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function autogrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.addEventListener('input', fit);
  setTimeout(fit, 0);
  return ta;
}

// ---- 키보드 높이 추적 (하단에 뜨는 요소들이 키보드에 가려지지 않게) ----
if (window.visualViewport) {
  const vv = window.visualViewport;
  const upd = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
  };
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
  upd();
}

// ---- 바텀 시트 ----
const layer = () => document.getElementById('layer');

export function sheet(content, { title, onClose } = {}) {
  const back = h('div', { class: 'sheet-back' });
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-grip' }),
    title ? h('div', { class: 'sheet-title' }, title) : null,
    content);
  const wrap = h('div', { class: 'sheet-wrap' }, back, box);
  let closed = false;
  let release = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    release();
    wrap.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 180);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', close);
  if (!('CloseWatcher' in window)) document.addEventListener('keydown', onKey);
  layer().append(wrap);
  release = interceptBack(close);
  return { close, box };
}

export function actions(items, title) {
  return new Promise((resolve) => {
    let picked = null;
    const list = h('div', { class: 'sheet-actions' },
      items.filter(Boolean).map((it) => it.info
        ? h('div', { class: 'sheet-info' }, it.label)
        : h('button', {
          class: 'sheet-action' + (it.danger ? ' danger' : ''),
          onclick: () => { picked = it; s.close(); },
        }, it.label)));
    const s = sheet(list, {
      title,
      onClose: () => { resolve(picked); setTimeout(() => picked?.run?.(), 0); },
    });
  });
}

export function ask(title, { value = '', placeholder = '', ok = t('common.ok') } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { class: 'field-input', value, placeholder, enterkeyhint: 'done' });
    const form = h('form', {
      class: 'sheet-form',
      onsubmit: (e) => { e.preventDefault(); result = input.value.trim() || null; s.close(); },
    }, input, h('button', { class: 'btn primary', type: 'submit' }, ok));
    const s = sheet(form, { title, onClose: () => resolve(result) });
    setTimeout(() => { input.focus(); input.select(); }, 60);
  });
}

export function askLong(title, { value = '', placeholder = '', ok = t('common.save'), note = null } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const input = autogrow(h('textarea', { class: 'field-input long', rows: 3, placeholder }));
    input.value = value;
    const form = h('form', {
      class: 'sheet-form',
      onsubmit: (e) => { e.preventDefault(); result = input.value.trim(); s.close(); },
    }, note ? h('p', { class: 'sheet-quote' }, note) : null, input, h('button', { class: 'btn primary', type: 'submit' }, ok));
    const s = sheet(form, { title, onClose: () => resolve(result) });
    setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 60);
  });
}

export function confirmBox(message, { ok = t('common.ok'), danger = false } = {}) {
  return new Promise((resolve) => {
    let yes = false;
    const box = h('div', { class: 'sheet-form' },
      h('p', { class: 'sheet-msg' }, message),
      h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { yes = true; s.close(); } }, ok),
      h('button', { class: 'btn ghost', onclick: () => s.close() }, t('common.cancel')));
    const s = sheet(box, { onClose: () => resolve(yes) });
  });
}

// ---- 토스트 ----
let toastEl = null;
export function toast(msg, { action, onAction, duration = 3200 } = {}) {
  toastEl?.remove();
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', null, msg),
    action ? h('button', { class: 'toast-act', onclick: () => { onAction?.(); el.remove(); } }, action) : null);
  document.body.append(el);
  toastEl = el;
  setTimeout(() => el.classList.add('out'), duration);
  setTimeout(() => el.remove(), duration + 300);
}

// 처음 한 번만 보여주는 짧은 안내
export function hintOnce(key, msg) {
  try {
    if (localStorage.getItem('ll:hint:' + key)) return;
    if (localStorage.getItem('ll:guide')) return; // 튜토리얼 중엔 튜토리얼이 말한다
    localStorage.setItem('ll:hint:' + key, '1');
  } catch { return; }
  setTimeout(() => toast(msg, { duration: 5200 }), 500);
}

// 아이콘 고르기. 고른 이름, '기본으로'면 '', 닫으면 null.
export function pickIcon(current, { title = t('common.icon'), defaultLabel = null } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    const done = (v) => { picked = v; s.close(); };
    const grid = h('div', { class: 'icon-grid' }, PICK_ICONS.map((n) => h('button', {
      class: 'icon-cell' + (n === current ? ' on' : ''), type: 'button', 'aria-label': n, onclick: () => done(n),
    }, icon(n))));
    const s = sheet(h('div', null,
      grid,
      defaultLabel ? h('button', { class: 'link-btn center', type: 'button', onclick: () => done('') }, defaultLabel) : null),
    { title, onClose: () => resolve(picked) });
  });
}

// 자체 드롭다운: 지금 값이 적힌 버튼을 누르면 바로 아래(자리가 없으면 위)에 목록이 펼쳐진다.
//   options = [{ value, label, sub? }], onPick(value)
export function dropdown({ value, options, onPick, label }) {
  const cur = () => options.find((o) => o.value === value) || options[0];
  const text = h('span', { class: 'dd-value' });
  const btn = h('button', { class: 'dd-btn', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label }, text, icon('down', 'dd-ic'));
  const wrap = h('div', { class: 'dd' }, btn);
  let menu = null, release = null;
  const draw = () => { text.textContent = cur().label; };
  const onOutside = (ev) => { if (!wrap.contains(ev.target)) close(); };
  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    release?.();
    release = null;
  }
  function open() {
    menu = h('div', { class: 'dd-menu', role: 'listbox', 'aria-label': label }, options.map((o) => h('button', {
      class: 'dd-opt' + (o.value === value ? ' on' : ''), type: 'button', role: 'option', 'aria-selected': o.value === value,
      onclick: () => { close(); if (o.value !== value) { value = o.value; draw(); onPick?.(o.value); } },
    }, h('span', { class: 'dd-check' }, o.value === value ? '✓' : ''), h('span', { class: 'dd-opt-text' }, o.label, o.sub ? h('small', null, o.sub) : null))));
    wrap.append(menu);
    // 아래 공간이 모자라면 위로 펼친다
    const r = btn.getBoundingClientRect(), mh = menu.offsetHeight;
    const vh = window.visualViewport?.height || innerHeight;
    menu.classList.toggle('up', r.bottom + mh + 12 > vh && r.top - mh - 12 > 0);
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    release = interceptBack(close);
    menu.querySelector('.dd-opt.on, .dd-opt')?.focus();
  }
  btn.addEventListener('click', () => (menu ? close() : open()));
  wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && menu) { ev.preventDefault(); close(); btn.focus(); } });
  draw();
  return wrap;
}
