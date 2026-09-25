// 환경 설정의 'AI 도우미 (선택)' 칸. 꺼져 있을 때는 설명과 '켜기'만.
import { h, dropdown, toast } from '../ui.js';
import { t } from '../i18n.js';
import { aiConfig, setAi, setAiFor } from './config.js';
import { PROVIDERS, AiError } from './providers.js';

export function aiSection() {
  const box = h('section', { class: 'entry-sec ai-sec' });
  let status = null; // { text, bad }

  function draw() {
    const c = aiConfig();
    const head = h('h3', null, t('ai.title'), h('span', { class: 'muted small' }, ' ' + t('ai.optional')));
    const about = [h('p', { class: 'muted small' }, t('ai.desc')), h('p', { class: 'muted small' }, t('ai.descPrivacy'))];
    if (!c.on) {
      box.replaceChildren(head, ...about,
        h('button', { class: 'btn ghost', onclick: () => { setAi({ on: true }); draw(); } }, t('ai.turnOn')));
      return;
    }
    const p = c.provider;
    const P = PROVIDERS[p];
    const key = h('input', {
      class: 'field-input ai-key', type: 'password', value: c.keys[p] || '', placeholder: `${t('ai.keyPh')} (${P.keyHint})`,
      autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': t('ai.key'),
      onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); check(); } },
    });
    async function check() {
      const k = key.value.trim();
      if (!k) { key.focus(); return; }
      setAiFor('keys', p, k);
      status = { text: t('ai.checking') };
      draw();
      try {
        const list = await P.listModels(k);
        setAiFor('models', p, list);
        const cur = aiConfig().model[p];
        if (cur && !list.some((m) => m.id === cur)) setAiFor('model', p, null); // 없어진 모델
        status = { text: t('ai.ok', { n: list.length }) };
      } catch (e) {
        const kind = e instanceof AiError ? e.kind : 'other';
        status = { text: kind === 'key' ? t('ai.badKey') : kind === 'network' ? t('ai.network') : t('ai.error', { msg: e.message }), bad: true };
      }
      draw();
    }
    const models = c.models[p] || [];
    const model = c.model[p] || '';
    const costLabel = (id) => { const k = P.cost(id); return k ? t('ai.cost.' + k) : null; };

    box.replaceChildren(...[head, ...about,
      h('div', { class: 'set-rows' },
        h('div', { class: 'set-line' },
          h('span', null, t('ai.provider')),
          dropdown({
            label: t('ai.provider'), value: p,
            options: Object.entries(PROVIDERS).map(([value, x]) => ({ value, label: x.name })),
            onPick: (v) => { setAi({ provider: v }); status = null; draw(); },
          })),
        h('div', { class: 'set-line' },
          h('span', null, t('ai.model')),
          models.length
            ? dropdown({
              label: t('ai.model'), value: model,
              options: [
                ...(model ? [] : [{ value: '', label: t('ai.pickModel') }]),
                ...models.map((m) => ({ value: m.id, label: m.label, sub: [m.label !== m.id ? m.id : null, costLabel(m.id)].filter(Boolean).join(' · ') || null })),
              ],
              onPick: (v) => { setAiFor('model', p, v || null); draw(); },
            })
            : h('span', { class: 'muted small ai-nomodel' }, t('ai.noModels')))),
      h('div', { class: 'ai-key-row' }, key,
        h('button', { class: 'btn primary inline', onclick: check }, t('ai.check'))),
      status ? h('p', { class: 'small ai-status' + (status.bad ? ' bad' : '') }, status.text) : null,
      h('p', { class: 'muted small' }, t('ai.keyNote')),
      h('div', { class: 'ai-links' },
        h('a', { class: 'link-btn small', href: P.keyUrl, target: '_blank', rel: 'noopener' }, t('ai.getKey', { name: P.name }), h('span', { class: 'ic-inline' }, '›')),
        c.keys[p] ? h('button', {
          class: 'link-btn small danger', onclick: () => {
            setAiFor('keys', p, null); setAiFor('models', p, null); setAiFor('model', p, null);
            status = null; toast(t('ai.keyCleared')); draw();
          },
        }, t('ai.clearKey')) : null,
        h('button', { class: 'link-btn small center', onclick: () => { setAi({ on: false }); status = null; draw(); } }, t('ai.turnOff')))].filter(Boolean)); // replaceChildren은 null을 글자로 넣는다
  }
  draw();
  return box;
}
