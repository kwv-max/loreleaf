// AI 도우미 묻기 창. 아래에서 올라오는 창에서 작품에 대해 묻고, 답 속 [화:줄] 표시를 누르면 그 자리로 간다.
// 대화는 작품마다 앱을 다시 열 때까지만 기억한다 (기기에 저장하지 않는다).
import { h, sheet, confirmBox, autogrow, num, icon } from '../ui.js';
import { t } from '../i18n.js';
import { db, chaptersOf } from '../store.js';
import { go } from '../router.js';
import { setJump } from '../screens/editor.js';
import { aiConfig, setAi, aiReady } from './config.js';
import { PROVIDERS, AiError } from './providers.js';
import { ask } from './agent.js';
import { toolLabel } from './tools.js';

const sessions = new Map(); // wid → { history, items: [{ q, a, usage, error }] }
const session = (wid) => sessions.get(wid) || sessions.set(wid, { history: [], items: [] }).get(wid);

export { aiReady };

export async function openAsk(wid, cid = null) {
  if (!aiReady()) return;
  const c = aiConfig();
  const P = PROVIDERS[c.provider];
  // 작품마다, 회사마다 처음 한 번: 무엇이 어디로 가는지 알리고 동의를 받는다
  const consentKey = `${wid}:${c.provider}`;
  if (!c.consent?.[consentKey]) {
    if (!(await confirmBox(t('ask.consent', { name: P.name }), { ok: t('ask.consentOk') }))) return;
    setAi({ consent: { ...(aiConfig().consent || {}), [consentKey]: true } });
  }

  const s = session(wid);
  const log = h('div', { class: 'ask-log' });
  const input = h('textarea', { class: 'ask-input', rows: 1, placeholder: t('ask.ph'), 'aria-label': t('ask.ph'), enterkeyhint: 'send' });
  const sendBtn = h('button', { class: 'ask-send', 'aria-label': t('ask.send'), title: t('ask.send') }, icon('up'));
  let running = null; // AbortController

  // 답에서 [3:12]를 눌렀을 때: 창을 닫고 그 화의 그 줄로
  function openCite(n, line) {
    const ch = chaptersOf(wid)[n - 1];
    if (!ch) return;
    sh.close();
    const lines = ch.text.split('\n');
    const l = Math.min(Math.max(1, line || 1), lines.length);
    const index = lines.slice(0, l - 1).reduce((a, x) => a + x.length + 1, 0);
    setTimeout(() => { setJump(ch.id, index, line ? lines[l - 1].length : 0); go(`/w/${wid}/c/${ch.id}`); }, 200);
  }

  const chip = (label, q) => h('button', { class: 'ask-chip', onclick: () => send(q) }, label);
  function draw() {
    log.replaceChildren(...s.items.map((it) => h('div', { class: 'ask-item' },
      h('div', { class: 'ask-q' }, it.q),
      it.a != null ? h('div', { class: 'ask-a' }, renderAnswer(it.a || t('ask.empty'), wid, openCite)) : null,
      it.step ? h('div', { class: 'ask-step muted small' }, h('span', { class: 'ask-dot' }), it.step) : null,
      it.error ? h('div', { class: 'ask-error small' }, it.error) : null,
      it.usage ? h('div', { class: 'ask-usage muted small' }, t('ask.usage', { in: num(it.usage.in), out: num(it.usage.out) })) : null)));
    if (!s.items.length) {
      log.append(h('div', { class: 'ask-empty' },
        h('p', { class: 'muted small' }, t('ask.intro')),
        h('div', { class: 'ask-chips' },
          chip(t('ask.chip.recap'), t('ask.q.recap')),
          cid ? chip(t('ask.chip.here'), t('ask.q.here')) : null,
          chip(t('ask.chip.missing'), t('ask.q.missing')))));
    }
    sendBtn.replaceChildren(icon(running ? 'close' : 'up'));
    sendBtn.setAttribute('aria-label', running ? t('ask.stop') : t('ask.send'));
    log.scrollTop = log.scrollHeight;
  }

  async function send(q) {
    q = (q ?? input.value).trim();
    if (!q || running) return;
    input.value = '';
    input.dispatchEvent(new Event('input')); // 높이도 한 줄로
    const it = { q, a: null, step: t('ask.thinking') };
    s.items.push(it);
    running = new AbortController();
    draw();
    try {
      const res = await ask({
        wid, cid, history: s.history, question: q, signal: running.signal,
        onStep: (call) => { it.step = toolLabel(wid, call.name, call.input, t); draw(); },
      });
      it.a = res.text;
      it.usage = res.usage;
    } catch (e) {
      const kind = e instanceof AiError ? e.kind : 'other';
      it.error = kind === 'aborted' ? t('ask.stopped') : kind === 'key' ? t('ai.badKey') : kind === 'network' ? t('ai.network')
        : kind === 'refused' ? t('ask.refused') : t('ask.failed', { msg: e.message });
    }
    it.step = null;
    running = null;
    draw();
  }

  sendBtn.addEventListener('click', () => (running ? running.abort() : send()));
  autogrow(input);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); }
  });

  const foot = h('div', { class: 'ask-foot muted small' },
    h('span', null, `${P.name} · ${(c.models[c.provider] || []).find((m) => m.id === c.model[c.provider])?.label || c.model[c.provider]}`),
    h('button', { class: 'link-btn small', onclick: () => { if (running) return; s.history.length = 0; s.items.length = 0; draw(); } }, t('ask.new')));
  const sh = sheet(h('div', { class: 'ask' }, log, h('div', { class: 'ask-bar' }, input, sendBtn), foot),
    { title: t('ask.title'), onClose: () => running?.abort() });
  sh.box.classList.add('ask-sheet');
  draw();
  if (!s.items.length) setTimeout(() => input.focus(), 250);
}

// 답 글 → 화면. 모델이 흔히 쓰는 모양(문단, - 목록, 1. 목록, **굵게**, # 제목)만 다루고, [화:줄]은 누를 수 있는 표시로.
const CITE = /\[(\d+)(?::(\d+)(?:\s*[-–~]\s*\d+)?)?\]/g;
function inline(text, wid, onCite) {
  const out = [];
  const chs = chaptersOf(wid);
  for (const [i, part] of text.split(/(\*\*[^*]+\*\*)/).entries()) {
    if (i % 2) { out.push(h('strong', null, part.slice(2, -2))); continue; }
    let last = 0;
    for (const m of part.matchAll(CITE)) {
      const n = +m[1], line = m[2] ? +m[2] : null;
      if (!chs[n - 1]) continue; // 없는 화 번호는 글자 그대로
      if (m.index > last) out.push(part.slice(last, m.index));
      out.push(h('button', { class: 'cite', title: chs[n - 1].title, onclick: () => onCite(n, line) }, line ? t('ask.cite', { n, line }) : t('ask.citeCh', { n })));
      last = m.index + m[0].length;
    }
    if (last < part.length) out.push(part.slice(last));
  }
  return out;
}
function renderAnswer(text, wid, onCite) {
  const blocks = [];
  let list = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const ordered = /^\s*\d/.test(line);
      if (!list || list.ordered !== ordered) { list = { ordered, el: h(ordered ? 'ol' : 'ul') }; blocks.push(list.el); }
      list.el.append(h('li', null, inline(bullet[1], wid, onCite)));
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const head = line.match(/^#+\s+(.*)$/);
    blocks.push(head ? h('p', null, h('strong', null, inline(head[1], wid, onCite))) : h('p', null, inline(line, wid, onCite)));
  }
  return blocks;
}
