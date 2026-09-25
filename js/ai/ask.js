// AI 도우미 묻기 창. 아래에서 올라오는 창에서 작품에 대해 묻고, 답 속 [화:줄] 표시를 누르면 그 자리로 간다.
// 대화는 작품마다 여러 개, 이 기기에 저장된다 (ai/chats.js). 창 위쪽 목록 버튼으로 고르고, 이름을 바꾸거나 지운다.
// 창 아래에서 모델과 생각하기를 고른다. 이미 주고받은 대화는 회사를 바꿀 수 없다 (회사마다 기록 모양이 달라서).
import { h, sheet, confirmBox, autogrow, num, icon, iconBtn, dropdown, actions, ask as askText, toast, relTime } from '../ui.js';
import { t } from '../i18n.js';
import { chaptersOf } from '../store.js';
import { go } from '../router.js';
import { setJump } from '../screens/editor.js';
import { aiConfig, setAi, setAiFor, aiReady } from './config.js';
import { PROVIDERS, AiError, canThink } from './providers.js';
import { ask } from './agent.js';
import { toolLabel } from './tools.js';
import { newChat, chatsOf, saveChat, deleteChat } from './chats.js';

const current = new Map(); // wid → 지금 열린 대화 (앱을 다시 열면 새 대화로 시작하고, 지난 대화는 목록에서)

export { aiReady };

const modelLabel = (provider, id) => (aiConfig().models[provider] || []).find((m) => m.id === id)?.label || id;
const freshChat = (wid) => { const c = aiConfig(); return newChat(wid, c.provider, c.model[c.provider]); };

export function openAsk(wid, cid = null) {
  if (!aiReady()) return;
  let chat = current.get(wid) || freshChat(wid);
  current.set(wid, chat);
  let view = 'chat'; // 'chat' | 'list'
  let running = null; // AbortController

  const head = h('div', { class: 'ask-head' });
  const log = h('div', { class: 'ask-log' });
  const input = h('textarea', { class: 'ask-input', rows: 1, placeholder: t('ask.ph'), 'aria-label': t('ask.ph'), enterkeyhint: 'send' });
  const sendBtn = h('button', { class: 'ask-send', 'aria-label': t('ask.send'), title: t('ask.send') }, icon('up'));
  const bar = h('div', { class: 'ask-bar' }, input, sendBtn);
  const foot = h('div', { class: 'ask-foot' });

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

  function startNew() {
    if (running) return;
    chat = freshChat(wid);
    current.set(wid, chat);
    view = 'chat';
    draw();
    setTimeout(() => input.focus(), 50);
  }

  function drawHead() {
    head.replaceChildren(...(view === 'list'
      ? [iconBtn('back', t('common.back'), () => { view = 'chat'; draw(); }), h('b', { class: 'ask-title' }, t('ask.chats')), iconBtn('plus', t('ask.new'), startNew)]
      : [iconBtn('list', t('ask.chats'), () => { if (!running) { view = 'list'; draw(); } }), h('b', { class: 'ask-title' }, chat.title || t('ask.title')), iconBtn('plus', t('ask.new'), startNew)]));
  }

  // 모델: 대화를 시작하기 전이면 연결된 모든 회사의 모델, 시작했으면 그 회사 모델만
  function drawFoot() {
    const c = aiConfig();
    const locked = chat.history.length > 0;
    const providers = Object.keys(PROVIDERS).filter((p) => c.keys[p] && (c.models[p] || []).length && (!locked || p === chat.provider));
    const options = providers.flatMap((p) => (c.models[p] || []).map((m) => {
      const cost = PROVIDERS[p].cost(m.id);
      return { value: `${p}|${m.id}`, label: m.label, sub: [providers.length > 1 ? PROVIDERS[p].name : null, cost ? t('ai.cost.' + cost) : null].filter(Boolean).join(' · ') || null };
    }));
    const now = `${chat.provider}|${chat.model}`;
    if (!options.some((o) => o.value === now)) options.unshift({ value: now, label: modelLabel(chat.provider, chat.model) });
    foot.replaceChildren(
      dropdown({
        label: t('ai.model'), value: now, options,
        onPick: (v) => {
          const [p, id] = v.split('|');
          chat.provider = p; chat.model = id;
          setAi({ provider: p }); setAiFor('model', p, id); // 다음 새 대화도 이 모델로
          if (chat.items.length) saveChat(chat);
          drawFoot();
        },
      }),
      canThink(chat.provider, chat.model)
        ? dropdown({
          label: t('ask.think'), value: c.thinking || 'mid',
          options: ['low', 'mid', 'deep'].map((k) => ({ value: k, label: t('ask.think.' + k), sub: t('ask.think.' + k + 'Sub') })),
          onPick: (v) => setAi({ thinking: v }),
        })
        : h('span', { class: 'muted small ask-nothink' }, t('ask.think.na')));
  }

  const chip = (label, q) => h('button', { class: 'ask-chip', onclick: () => send(q) }, label);
  function drawChat() {
    log.replaceChildren(...chat.items.map((it) => h('div', { class: 'ask-item' },
      h('div', { class: 'ask-q' }, it.q),
      it.a != null ? h('div', { class: 'ask-a' }, renderAnswer(it.a || t('ask.empty'), wid, openCite)) : null,
      it.step ? h('div', { class: 'ask-step muted small' }, h('span', { class: 'ask-dot' }), it.step) : null,
      it.error ? h('div', { class: 'ask-error small' }, it.error) : null,
      it.usage ? h('div', { class: 'ask-usage muted small' }, t('ask.usage', { in: num(it.usage.in), out: num(it.usage.out) })) : null)));
    if (!chat.items.length) {
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

  async function drawList() {
    const list = await chatsOf(wid);
    if (view !== 'list') return;
    log.replaceChildren(list.length
      ? h('div', { class: 'ask-list' }, list.map((x) => h('div', { class: 'ask-row' + (x.id === chat.id ? ' on' : '') },
        h('button', { class: 'ask-row-main', onclick: () => { chat = x; current.set(wid, chat); view = 'chat'; draw(); } },
          h('span', { class: 'ask-row-title' }, x.title || t('ask.title')),
          h('span', { class: 'muted small' }, `${relTime(x.updatedAt)} · ${modelLabel(x.provider, x.model)}`)),
        iconBtn('more', t('ask.chatMenu'), () => chatMenu(x)))))
      : h('p', { class: 'muted small ask-none' }, t('ask.noChats')));
  }

  function chatMenu(x) {
    actions([
      { label: t('ask.rename'), run: async () => {
        const v = await askText(t('ask.rename'), { value: x.title });
        if (v == null || !v.trim()) return;
        x.title = v.trim();
        await saveChat(x);
        draw();
      } },
      { label: t('ask.delete'), danger: true, run: async () => {
        await deleteChat(x.id);
        if (x.id === chat.id) { chat = freshChat(wid); current.set(wid, chat); }
        draw();
        toast(t('ask.deleted'), { action: t('common.undo'), onAction: async () => { await saveChat(x); draw(); } });
      } },
    ], x.title || t('ask.title'));
  }

  function draw() {
    drawHead();
    bar.hidden = foot.hidden = view === 'list';
    if (view === 'list') { log.replaceChildren(); drawList(); } else { drawChat(); drawFoot(); }
  }

  async function send(q) {
    q = (q ?? input.value).trim();
    if (!q || running) return;
    // 작품마다, 회사마다 처음 한 번: 무엇이 어디로 가는지 알리고 동의를 받는다
    const consentKey = `${wid}:${chat.provider}`;
    if (!aiConfig().consent?.[consentKey]) {
      if (!(await confirmBox(t('ask.consent', { name: PROVIDERS[chat.provider].name }), { ok: t('ask.consentOk') }))) return;
      setAi({ consent: { ...(aiConfig().consent || {}), [consentKey]: true } });
    }
    input.value = '';
    input.dispatchEvent(new Event('input')); // 높이도 한 줄로
    const it = { q, a: null, step: t('ask.thinking') };
    const mine = chat; // 기다리는 동안 다른 대화를 열어도 답은 이 대화에 남긴다
    mine.items.push(it);
    if (!mine.title) mine.title = q.length > 40 ? q.slice(0, 40) + '…' : q;
    running = new AbortController();
    draw();
    try {
      const res = await ask({
        wid, cid, chat: mine, question: q, signal: running.signal,
        onStep: (call) => { it.step = toolLabel(wid, call.name, call.input, t); if (chat === mine && view === 'chat') drawChat(); },
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
    mine.updatedAt = Date.now();
    saveChat(mine);
    draw();
  }

  sendBtn.addEventListener('click', () => (running ? running.abort() : send()));
  autogrow(input);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); }
  });

  const sh = sheet(h('div', { class: 'ask' }, head, log, bar, foot), { onClose: () => running?.abort() });
  sh.box.classList.add('ask-sheet');
  draw();
  if (!chat.items.length) setTimeout(() => input.focus(), 250);
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
