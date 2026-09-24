// 작은 DOM 도우미와 공용 UI(시트, 토스트, 입력창).

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
  leaf: '<path d="M5 19C5 10 11 5 20 4c0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
};
export function icon(name, cls = '') {
  const s = h('span', { class: 'ic ' + cls, 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return s;
}

export const iconBtn = (name, label, onclick) => h('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick }, icon(name));

export function topbar({ onBack, title, right = [] }) {
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-row' },
      onBack ? iconBtn('back', '뒤로', onBack) : null,
      h('div', { class: 'topbar-title' + (onBack ? '' : ' brand') }, title),
      right));
}

export const esc =(s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function relTime(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(t);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 받침에 따라 조사 고르기: josa('유나', '을', '를') → '를'
export function josa(word, withFinal, withoutFinal) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  const hasFinal = c >= 0xac00 && c <= 0xd7a3
    ? (c - 0xac00) % 28 !== 0
    : /[013678lmnr]$/i.test(String(word).trim()); // 숫자·영문은 읽는 소리로 대강 판단
  return hasFinal ? withFinal : withoutFinal;
}

export const num = (n) => n.toLocaleString('ko-KR');

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
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 180);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  layer().append(wrap);
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

export function ask(title, { value = '', placeholder = '', ok = '확인' } = {}) {
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

export function confirmBox(message, { ok = '확인', danger = false } = {}) {
  return new Promise((resolve) => {
    let yes = false;
    const box = h('div', { class: 'sheet-form' },
      h('p', { class: 'sheet-msg' }, message),
      h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { yes = true; s.close(); } }, ok),
      h('button', { class: 'btn ghost', onclick: () => s.close() }, '취소'));
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
