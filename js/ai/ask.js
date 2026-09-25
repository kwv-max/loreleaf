// AI 도우미 묻기 창. 아래에서 올라오는 창에서 작품에 대해 묻고, 답 속 [화:줄] 표시를 누르면 그 자리로 간다.
// 대화는 작품마다 여러 개, 이 기기에 저장된다 (ai/chats.js). 창 위쪽 목록 버튼으로 고르고, 이름을 바꾸거나 지운다.
// 창 아래에서 모델과 생각하기를 고른다. 이미 주고받은 대화는 회사를 바꿀 수 없다 (회사마다 기록 모양이 달라서).
import { h, sheet, confirmBox, autogrow, num, icon, iconBtn, dropdown, actions, ask as askText, toast, relTime } from '../ui.js';
import { t } from '../i18n.js';
import { db, chaptersOf, typesOf, createEntry, put, del, uid, touchWork } from '../store.js';
import { snapshot } from '../versions.js';
import { diffRange, remapRange } from '../anchors.js';
import { setChange } from '../timeline.js';
import { go } from '../router.js';
import { setJump } from '../screens/editor.js';
import { aiConfig, setAi, setAiFor, aiReady } from './config.js';
import { PROVIDERS, AiError, canThink } from './providers.js';
import { ask } from './agent.js';
import { toolLabel, buildAttach, MAX_ATTACH } from './tools.js';
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
  const attBtn = h('button', { class: 'ask-attach', 'aria-label': t('ask.att.btn'), title: t('ask.att.btn') }, icon('clip'));
  const bar = h('div', { class: 'ask-bar' }, attBtn, input, sendBtn);
  const attRow = h('div', { class: 'ask-att' });
  let att = []; // 다음 질문에 붙일 것 (보내면 비운다)
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

  // ---- 첨부: 이 화, 회차 범위, 설정 항목·분류, 설정 전체 ----
  const allEntries = () => [...db.entries.values()].filter((e) => e.workId === wid && e.name.trim());
  function attLabel(a) {
    if (a.kind === 'ch') return a.from === a.to ? t('ask.citeCh', { n: a.from }) : t('ask.att.chs', { from: a.from, to: a.to });
    if (a.kind === 'entry') return db.entries.get(a.id)?.name || '?';
    if (a.kind === 'type') return t('ask.att.type', { type: typesOf(wid).find((x) => x.key === a.key)?.label || a.key });
    return t('ask.att.allEntries');
  }
  function addAtt(a) {
    if (!att.some((x) => JSON.stringify(x) === JSON.stringify(a))) att.push(a);
    drawAtt();
    input.focus();
  }
  function sizeNote(size) {
    if (size > MAX_ATTACH) return t('ask.att.cut', { n: num(MAX_ATTACH) });
    return t(size > 30000 ? 'ask.att.big' : 'ask.att.size', { n: num(size) });
  }
  function drawAtt() {
    attRow.hidden = !att.length || view === 'list';
    if (attRow.hidden) return attRow.replaceChildren();
    const { size } = buildAttach(wid, att);
    attRow.replaceChildren(...att.map((a, i) => h('span', { class: 'att-chip' }, icon('clip'), h('span', { class: 'att-chip-text' }, attLabel(a)),
      h('button', { class: 'att-x', 'aria-label': t('ask.att.remove'), onclick: () => { att.splice(i, 1); drawAtt(); } }, icon('close')))),
    h('span', { class: 'muted small att-size' + (size > 30000 ? ' big' : '') }, sizeNote(size)));
  }

  function attachMenu() {
    const chs = chaptersOf(wid);
    const here = cid ? chs.findIndex((c) => c.id === cid) + 1 : 0;
    actions([
      here ? { label: t('ask.att.thisCh', { n: here }), run: () => addAtt({ kind: 'ch', from: here, to: here }) } : null,
      { label: t('ask.att.range'), run: rangeSheet },
      { label: t('ask.att.entries'), run: entrySheet },
      { label: t('ask.att.allEntries'), run: () => (allEntries().length ? addAtt({ kind: 'all' }) : toast(t('ask.att.noEntries'))) },
    ], t('ask.att.title'));
  }

  function rangeSheet() {
    const chs = chaptersOf(wid);
    if (!chs.length) { toast(t('ask.att.noCh')); return; }
    let from = Math.max(1, cid ? chs.findIndex((c) => c.id === cid) + 1 : 1), to = from;
    const options = chs.map((c, i) => ({ value: i + 1, label: `${i + 1}. ${c.title}` }));
    const size = h('p', { class: 'muted small att-size' });
    const upd = () => { size.textContent = sizeNote(buildAttach(wid, [{ kind: 'ch', from: Math.min(from, to), to: Math.max(from, to) }]).size); };
    const s = sheet(h('div', { class: 'att-sheet' },
      h('div', { class: 'att-range' },
        h('div', { class: 'att-field' }, h('span', { class: 'muted small' }, t('ask.att.from')), dropdown({ label: t('ask.att.from'), value: from, options, onPick: (v) => { from = v; upd(); } })),
        h('div', { class: 'att-field' }, h('span', { class: 'muted small' }, t('ask.att.to')), dropdown({ label: t('ask.att.to'), value: to, options, onPick: (v) => { to = v; upd(); } }))),
      size,
      h('button', { class: 'btn primary', onclick: () => { s.close(); addAtt({ kind: 'ch', from: Math.min(from, to), to: Math.max(from, to) }); } }, t('ask.att.add'))),
    { title: t('ask.att.rangeTitle') });
    upd();
  }

  function entrySheet() {
    const entries = allEntries();
    if (!entries.length) { toast(t('ask.att.noEntries')); return; }
    const picked = new Set(), pickedTypes = new Set();
    const types = typesOf(wid).filter((ty) => entries.some((e) => e.type === ty.key));
    const filter = entries.length > 12 ? h('input', { class: 'input att-filter', type: 'search', placeholder: t('ask.att.filter'), oninput: () => drawList() }) : null;
    const list = h('div', { class: 'att-list' });
    const size = h('p', { class: 'muted small att-size' });
    const addBtn = h('button', { class: 'btn primary', onclick: () => {
      s.close();
      for (const key of pickedTypes) addAtt({ kind: 'type', key });
      for (const id of picked) if (!pickedTypes.has(db.entries.get(id)?.type)) addAtt({ kind: 'entry', id });
    } });
    const row = (label, on, onclick, cls = '') => h('button', { class: `att-row ${cls}${on ? ' on' : ''}`, onclick }, h('span', { class: 'att-check' }, on ? '✓' : ''), h('span', { class: 'att-row-text' }, label));
    const toggle = (set, x) => { set.has(x) ? set.delete(x) : set.add(x); drawList(); };
    function drawList() {
      const q = filter?.value.trim().toLowerCase() || '';
      const match = (e) => !q || e.name.toLowerCase().includes(q) || (e.aliases || []).some((x) => x.toLowerCase().includes(q));
      list.replaceChildren(...types.flatMap((ty) => {
        const all = entries.filter((e) => e.type === ty.key), es = all.filter(match);
        if (!es.length) return [];
        const whole = pickedTypes.has(ty.key);
        return [row(`${t('ask.att.type', { type: ty.label })} · ${all.length}`, whole, () => toggle(pickedTypes, ty.key), 'att-type'),
          ...es.map((e) => row(e.name, whole || picked.has(e.id), () => { if (!whole) toggle(picked, e.id); }, whole ? 'dim' : ''))];
      }));
      const chosen = [...[...pickedTypes].map((key) => ({ kind: 'type', key })), ...[...picked].map((id) => ({ kind: 'entry', id }))];
      const n = pickedTypes.size + [...picked].filter((id) => !pickedTypes.has(db.entries.get(id)?.type)).length;
      addBtn.disabled = !n;
      addBtn.textContent = n ? t('ask.att.addN', { n }) : t('ask.att.add');
      size.textContent = n ? sizeNote(buildAttach(wid, chosen).size) : '';
    }
    const s = sheet(h('div', { class: 'att-sheet' }, filter, list, size, addBtn), { title: t('ask.att.entriesTitle') });
    drawList();
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
      h('div', { class: 'ask-q' }, (it.att || []).length ? h('div', { class: 'ask-q-att' }, it.att.map((l) => h('span', { class: 'att-tag' }, icon('clip'), l))) : null, it.q),
      it.a != null ? h('div', { class: 'ask-a' }, renderAnswer(it.a || t('ask.empty'), wid, openCite)) : null,
      it.step ? h('div', { class: 'ask-step muted small' }, h('span', { class: 'ask-dot' }), it.step) : null,
      it.error ? h('div', { class: 'ask-error small' }, it.error) : null,
      (it.proposals || []).length ? h('div', { class: 'ask-props' }, it.proposals.map((p) => proposalCard(p))) : null,
      it.usage ? h('div', { class: 'ask-usage muted small' }, t('ask.usage', { in: num(it.usage.in), out: num(it.usage.out) })) : null)));
    if (!chat.items.length) {
      log.append(h('div', { class: 'ask-empty' },
        h('p', { class: 'muted small' }, t('ask.intro')),
        h('div', { class: 'ask-chips' },
          chip(t('ask.chip.recap'), t('ask.q.recap')),
          cid ? chip(t('ask.chip.here'), t('ask.q.here')) : null,
          chip(t('ask.chip.check'), cid ? t('ask.q.checkHere') : t('ask.q.check')),
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

  // ---- 제안 카드: '추가'·'반영'을 눌러야 저장된다. 누른 뒤에는 되돌리기 알림 ----
  const chName = (n) => chaptersOf(wid)[n - 1]?.title || t('ask.citeCh', { n });
  function proposalCard(p) {
    if (p.kind === 'fix') return fixCard(p);
    const done = p.status === 'done', gone = p.status === 'dismissed';
    const body = p.kind === 'entry'
      ? [h('div', { class: 'prop-head' }, t('ask.prop.newEntry', { type: p.typeLabel }), ' · ', h('b', null, p.name)),
        p.aliases.length ? h('div', { class: 'prop-line' }, h('span', { class: 'muted' }, t('ask.prop.aliases') + ' '), p.aliases.join(', ')) : null,
        ...p.fields.map(([l, v]) => h('div', { class: 'prop-line' }, h('span', { class: 'muted' }, l + ' '), v)),
        p.note ? h('div', { class: 'prop-line' }, p.note) : null]
      : [h('div', { class: 'prop-head' }, h('b', null, t('ask.prop.change', { name: p.name, field: p.field })), ' · ', h('span', { class: 'muted' }, p.from ? t('ask.prop.from', { n: p.from }) : t('ask.prop.base'))),
        h('div', { class: 'prop-line' }, h('s', { class: 'muted' }, p.old || t('ask.prop.empty')), ' → ', h('b', null, p.value || t('ask.prop.empty')))];
    const reason = p.reason ? h('div', { class: 'prop-reason muted small' }, inline(p.reason, wid, openCite)) : null;
    const foot = done
      ? h('div', { class: 'prop-foot' }, h('span', { class: 'prop-done' }, '✓ ', p.kind === 'entry' ? t('ask.prop.added') : t('ask.prop.applied')),
        h('button', { class: 'link-btn small', onclick: () => { const e = db.entries.get(p.entryId); if (e) { sh.close(); setTimeout(() => go(`/w/${wid}/e/${e.id}`), 200); } } }, t('ask.prop.open')))
      : gone ? null
        : h('div', { class: 'prop-foot' },
          h('button', { class: 'btn ghost inline prop-btn', onclick: () => { p.status = 'dismissed'; saveChat(chat); drawChat(); } }, t('ask.prop.dismiss')),
          h('button', { class: 'btn primary inline prop-btn', onclick: () => accept(p) }, p.kind === 'entry' ? t('ask.prop.add') : t('ask.prop.apply')));
    if (gone) return h('div', { class: 'prop gone muted small' }, p.kind === 'entry' ? p.name : `${p.name} · ${p.field}`, ' — ', t('ask.prop.dismissed'));
    return h('div', { class: 'prop' + (done ? ' done' : '') }, body, reason, foot);
  }

  // ---- 원고 고침 카드: 그 줄의 앞뒤 몇 글자와 함께, 지울 글자와 넣을 글자를 표시 ----
  const chNum = (p) => chaptersOf(wid).findIndex((c) => c.id === p.chapterId) + 1 || p.chapter;
  function fixCard(p) {
    const done = p.status === 'done';
    if (p.status === 'dismissed') return h('div', { class: 'prop gone muted small' }, `${p.find} → ${p.replace}`, ' — ', t('ask.prop.dismissed'));
    const n = chNum(p);
    return h('div', { class: 'prop fix' + (done ? ' done' : '') },
      h('div', { class: 'prop-head' }, h('b', null, t('ask.fix.head')), ' · ', h('span', { class: 'muted' }, t('ask.cite', { n, line: p.line }))),
      h('div', { class: 'prop-line fix-line' },
        p.pre.length === 24 ? '…' : '', p.pre,
        h('del', { class: 'fix-del' }, p.find), h('ins', { class: 'fix-ins' }, p.replace),
        p.post, p.post.length === 24 ? '…' : ''),
      p.reason ? h('div', { class: 'prop-reason muted small' }, inline(p.reason, wid, openCite)) : null,
      done
        ? h('div', { class: 'prop-foot' }, h('span', { class: 'prop-done' }, '✓ ', t('ask.fix.done')),
          h('button', { class: 'link-btn small', onclick: () => viewFix(p) }, t('ask.fix.view')))
        : h('div', { class: 'prop-foot' },
          h('button', { class: 'btn ghost inline prop-btn', onclick: () => { p.status = 'dismissed'; saveChat(chat); drawChat(); } }, t('ask.prop.dismiss')),
          h('button', { class: 'btn primary inline prop-btn', onclick: () => accept(p) }, t('ask.fix.apply'))));
  }

  // 고칠 자리: 적어 둔 줄에서 먼저 찾고, 줄이 밀렸으면 화 전체에서 한 곳뿐일 때만
  function fixAt(ch, p, word = p.find) {
    const lines = ch.text.split('\n');
    const start = lines.slice(0, p.line - 1).reduce((a, x) => a + x.length + 1, 0);
    const i = (lines[p.line - 1] || '').indexOf(word);
    if (i >= 0) return start + i;
    const first = ch.text.indexOf(word);
    return first >= 0 && ch.text.indexOf(word, first + 1) < 0 ? first : -1;
  }

  function viewFix(p) {
    const ch = db.chapters.get(p.chapterId);
    if (!ch) return;
    const at = fixAt(ch, p, p.replace);
    sh.close();
    setTimeout(() => { if (at >= 0) setJump(ch.id, at, p.replace.length); go(`/w/${wid}/c/${ch.id}`); }, 200);
  }

  // 열려 있는 에디터에 알린다 (그 화면이 새 글로 바뀌고, 에디터의 ↶로도 되돌릴 수 있다)
  const chapterChanged = (cid) => window.dispatchEvent(new CustomEvent('ll-chapter-changed', { detail: { cid } }));

  function accept(p) {
    let undo;
    if (p.kind === 'fix') {
      window.dispatchEvent(new Event('ll-flush')); // 에디터에 쓰던 글을 먼저 저장
      const ch = db.chapters.get(p.chapterId);
      if (!ch) { toast(t('ask.prop.noChapter')); return; }
      const at = fixAt(ch, p);
      if (at < 0) { toast(t('ask.fix.stale')); return; }
      snapshot(ch); // 고치기 전 모습을 '이전 버전'에 (글을 바로 복사해 두므로 기다리지 않아도 된다)
      const before = { text: ch.text, notes: (ch.notes || []).map((n) => ({ ...n })) };
      const text = ch.text.slice(0, at) + p.replace + ch.text.slice(at + p.find.length);
      const d = diffRange(ch.text, text, at + p.replace.length);
      ch.notes = before.notes.map((n) => remapRange(n, d));
      ch.text = text; // 줄바꿈이 없어서 대사 줄 표시는 그대로
      put('chapters', ch);
      touchWork(wid);
      chapterChanged(ch.id);
      undo = () => {
        window.dispatchEvent(new Event('ll-flush'));
        if (ch.text !== text) { toast(t('ask.fix.cantUndo')); return false; } // 그 사이 글을 더 고쳤으면 '이전 버전'으로
        ch.text = before.text;
        ch.notes = before.notes;
        put('chapters', ch);
        chapterChanged(ch.id);
      };
    } else if (p.kind === 'entry') {
      if ([...db.entries.values()].some((e) => e.workId === wid && (e.name === p.name))) { toast(t('ask.prop.exists')); return; }
      const e = createEntry(wid, p.type, { name: p.name });
      e.aliases = p.aliases.slice();
      e.fields = p.fields.map(([label, value]) => ({ id: uid(), label, value }));
      e.note = p.note || '';
      put('entries', e);
      p.entryId = e.id;
      undo = () => del('entries', e.id);
    } else {
      const e = db.entries.get(p.entryId);
      if (!e) { toast(t('ask.prop.gone')); return; }
      const before = JSON.parse(JSON.stringify(e));
      let f = e.fields.find((x) => x.label.trim().toLowerCase() === p.field.trim().toLowerCase());
      if (!f) { f = { id: uid(), label: p.field, value: '' }; e.fields.push(f); }
      if (p.from) {
        const ch = chaptersOf(wid)[p.from - 1];
        if (!ch) { toast(t('ask.prop.noChapter')); return; }
        setChange(e, f, ch.id, p.value); // 저장까지 한다
      } else {
        f.value = p.value;
        put('entries', e);
      }
      undo = () => { Object.keys(e).forEach((k) => delete e[k]); Object.assign(e, before); put('entries', e); };
    }
    p.status = 'done';
    saveChat(chat);
    drawChat();
    toast(p.kind === 'entry' ? t('ask.prop.added') : p.kind === 'fix' ? t('ask.fix.done') : t('ask.prop.applied'), {
      action: t('common.undo'),
      onAction: () => { if (undo() === false) return; p.status = null; saveChat(chat); if (view === 'chat') drawChat(); toast(t('ask.prop.undone')); },
    });
  }

  function draw() {
    drawHead();
    bar.hidden = foot.hidden = view === 'list';
    drawAtt();
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
    const attach = att.length ? buildAttach(wid, att).text : '';
    if (att.length) it.att = att.map(attLabel);
    att = [];
    const mine = chat; // 기다리는 동안 다른 대화를 열어도 답은 이 대화에 남긴다
    mine.items.push(it);
    if (!mine.title) mine.title = q.length > 40 ? q.slice(0, 40) + '…' : q;
    running = new AbortController();
    draw();
    try {
      const res = await ask({
        wid, cid, chat: mine, question: q, attach, signal: running.signal,
        onStep: (call) => { it.step = toolLabel(wid, call.name, call.input, t); if (chat === mine && view === 'chat') drawChat(); },
      });
      it.a = res.text;
      it.usage = res.usage;
      it.proposals = (res.proposals || []).map((p) => ({ ...p, status: null }));
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
  attBtn.addEventListener('click', attachMenu);
  autogrow(input);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); }
  });

  const sh = sheet(h('div', { class: 'ask' }, head, log, attRow, bar, foot), { onClose: () => running?.abort() });
  sh.box.classList.add('ask-sheet');
  draw();
  if (!chat.items.length) setTimeout(() => input.focus(), 250);
}

// 답 글 → 화면. 모델이 흔히 쓰는 모양(문단, - 목록, 1. 목록, **굵게**, # 제목)만 다루고, [화:줄]은 누를 수 있는 표시로.
// 한 괄호에 여러 곳을 넣기도 한다: [3:1, 3:5] [3:1; 4:2] [3:1, 5](같은 화 5줄) [3:1-4] [2, 3](화 여러 개)
const REF = String.raw`\d+(?:\s*:\s*\d+)?(?:\s*[-–~]\s*\d+)?`;
const CITE = new RegExp(String.raw`\[\s*(${REF}(?:\s*[,;，、]\s*${REF})*)\s*\]`, 'g');
function citeRefs(body) {
  const out = [];
  let chapter = null;
  for (const part of body.split(/[,;，、]/)) {
    const m = part.trim().match(/^(\d+)(?:\s*:\s*(\d+))?/);
    if (!m) return null;
    if (m[2]) { chapter = +m[1]; out.push({ n: chapter, line: +m[2] }); }
    else if (chapter != null && body.includes(':')) out.push({ n: chapter, line: +m[1] }); // [3:1, 5] → 3화 5줄
    else out.push({ n: +m[1], line: null }); // [2, 3] → 2화, 3화
  }
  return out;
}
function inline(text, wid, onCite) {
  const out = [];
  const chs = chaptersOf(wid);
  for (const [i, part] of text.split(/(\*\*[^*]+\*\*)/).entries()) {
    if (i % 2) { out.push(h('strong', null, part.slice(2, -2))); continue; }
    let last = 0;
    for (const m of part.matchAll(CITE)) {
      const refs = citeRefs(m[1]);
      if (!refs || refs.some((r) => !chs[r.n - 1])) continue; // 없는 화 번호가 섞이면 글자 그대로
      if (m.index > last) out.push(part.slice(last, m.index));
      for (const { n, line } of refs) {
        out.push(h('button', { class: 'cite', title: chs[n - 1].title, onclick: () => onCite(n, line) }, line ? t('ask.cite', { n, line }) : t('ask.citeCh', { n })));
      }
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
