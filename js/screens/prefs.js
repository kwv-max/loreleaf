// 환경 설정. 취향이 갈리는 것만 여기에. 항목이 늘어도 한 화면에서 끝나게.
import { h, topbar, toast, dropdown } from '../ui.js';
import { versionReady, checkUpdate, showUpdate } from '../update.js';
import { openHelp, PRIVACY } from './help.js';
import { supportLinks, supportSheet, feedbackURL } from '../support.js';
import { back } from '../router.js';
import { pref, setPref, ACCENTS, applyAccent, applyTheme, applyText, isDark, TEXT_FONTS } from '../prefs.js';
import { t, LANGS, systemLang, lang } from '../i18n.js';
import { aiSection } from '../ai/settings.js';

function choice(name, options, onPick) {
  const box = h('div', { class: 'choices', role: 'radiogroup' });
  const draw = () => box.replaceChildren(...options.map((o) => h('button', {
    class: 'choice' + (pref(name) === o.value ? ' on' : ''),
    role: 'radio', 'aria-checked': pref(name) === o.value,
    onclick: () => { setPref(name, o.value); onPick?.(o.value); draw(); },
  }, h('span', { class: 'choice-sample' }, o.sample), h('span', { class: 'choice-label' }, o.label))));
  draw();
  return box;
}

// 포인트 색: 버튼, 강조 표시, 안내에 쓰이는 색
function accentPicker() {
  const box = h('div', { class: 'accent-row', role: 'radiogroup', 'aria-label': t('prefs.accent') });
  const draw = () => box.replaceChildren(...ACCENTS.map(([key, , l, , d]) => h('button', {
    class: 'accent-opt' + (pref('accent') === key ? ' on' : ''),
    role: 'radio', 'aria-checked': pref('accent') === key,
    onclick: () => { setPref('accent', key); applyAccent(key); draw(); },
  }, h('span', { class: 'swatch', style: `--c:${isDark() ? d : l}` }), h('span', { class: 'accent-label' }, t('accent.' + key)))));
  draw();
  redrawAccents = draw;
  return box;
}
let redrawAccents = () => {};

// 에디터 글자 크기·줄 간격·글꼴. 바꾸면 아래 미리보기에 바로 보인다.
function textPrefs() {
  const preview = h('div', { class: 'text-preview' }, t('prefs.text.preview'));
  const pick = (name, options) => choice(name, options, () => applyText());
  const g = t('prefs.text.glyph');
  return h('div', { class: 'text-prefs' },
    pick('edSize', [
      { value: 's', label: t('prefs.text.s'), sample: h('span', { style: 'font-size:15px' }, g) },
      { value: 'm', label: t('prefs.text.m'), sample: h('span', { style: 'font-size:17px' }, g) },
      { value: 'l', label: t('prefs.text.l'), sample: h('span', { style: 'font-size:19px' }, g) },
      { value: 'xl', label: t('prefs.text.xl'), sample: h('span', { style: 'font-size:21px' }, g) },
    ]),
    pick('edLine', [
      { value: 'normal', label: t('prefs.line.normal'), sample: '≡' },
      { value: 'wide', label: t('prefs.line.wide'), sample: '☰' },
    ]),
    pick('edFont', [
      { value: 'sans', label: t('prefs.font.sans'), sample: h('span', { style: 'font-family:var(--font)' }, t('app.name')) },
      { value: 'serif', label: t('prefs.font.serif'), sample: h('span', { style: 'font-family:' + TEXT_FONTS.serif }, t('app.name')) },
    ]),
    preview,
    h('p', { class: 'muted small' }, t('prefs.text.note')));
}

// 이 기기에서 쓰는 저장 공간과, 브라우저가 함부로 지우지 않게 보호되는지
function storageInfo() {
  const el = h('p', { class: 'muted small storage-info' }, t('prefs.storage.checking'));
  (async () => {
    try {
      const [est, kept] = await Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()]);
      const mb = est?.usage != null ? (est.usage / 1048576).toFixed(1) + 'MB' : null;
      el.textContent = [
        mb && t('prefs.storage.usage', { mb }),
        kept === true ? t('prefs.storage.kept') : kept === false ? t('prefs.storage.notKept') : null,
      ].filter(Boolean).join(' · ') || t('prefs.storage.unknown');
    } catch { el.textContent = t('prefs.storage.unknown'); }
  })();
  return el;
}

function versionLabel() {
  const el = h('span', null, t('app.name'));
  versionReady().then((v) => { if (v) el.textContent = `${t('app.name')} ${v}`; });
  return el;
}

// 따옴표 모양 보기: 언어에 맞는 짧은 말로
const qs = (o, c, o2, c2) => `${o}${t('prefs.quotes.say')}${c} ${o2}${t('prefs.quotes.think')}${c2}`;

export function prefsScreen() {
  return h('div', { class: 'screen' },
    topbar({ onBack: () => back('/'), title: t('prefs.title') }),
    h('main', { class: 'content entry' },
      // 언어·화면 모드: 한 줄씩, 자체 드롭다운으로
      h('section', { class: 'entry-sec' },
        h('div', { class: 'set-rows' },
          h('div', { class: 'set-line' },
            h('span', null, t('prefs.lang')),
            dropdown({
              label: t('prefs.lang'),
              value: pref('lang') || 'system',
              options: [
                { value: 'system', label: `${t('prefs.lang.system')} (${LANGS.find(([k]) => k === systemLang())[1]})` },
                ...LANGS.map(([value, name]) => ({ value, label: name })),
              ],
              // 언어를 바꾸면 모든 화면을 새로 그려야 해서 다시 연다
              onPick: (v) => { setPref('lang', v); setTimeout(() => location.reload(), 120); },
            })),
          h('div', { class: 'set-line' },
            h('span', null, t('prefs.theme')),
            dropdown({
              label: t('prefs.theme'),
              value: pref('theme'),
              options: [
                { value: 'system', label: t('prefs.theme.system') },
                { value: 'light', label: t('prefs.theme.light') },
                { value: 'dark', label: t('prefs.theme.dark') },
              ],
              onPick: (v) => { setPref('theme', v); applyTheme(v); redrawAccents(); },
            }))),
        h('p', { class: 'muted small' }, t('prefs.lang.note'))),
      h('section', { class: 'entry-sec' },
        h('h3', null, t('prefs.text')),
        textPrefs()),
      h('section', { class: 'entry-sec' },
        h('h3', null, t('prefs.goal')),
        choice('goal', [
          { value: 0, label: t('prefs.goal.none'), sample: '—' },
          // 영어는 단어 수라서 목표도 작게
          ...(lang() === 'en' ? [500, 1000, 2000] : [2000, 5000, 10000]).map((n) => ({ value: n, label: t('prefs.goal.day'), sample: t('prefs.goal.n', { n }) })),
        ]),
        h('p', { class: 'muted small' }, t('prefs.goal.note'))),
      h('section', { class: 'entry-sec' },
        h('h3', null, t('prefs.accent')),
        accentPicker(),
        h('p', { class: 'muted small' }, t('prefs.accent.note'))),
      h('section', { class: 'entry-sec' },
        h('h3', null, t('prefs.quotes')),
        choice('quotes', [
          { value: 'curly', label: t('prefs.quotes.curly'), sample: qs('“', '”', '‘', '’') },
          { value: 'straight', label: t('prefs.quotes.straight'), sample: qs('"', '"', "'", "'") },
          { value: 'corner', label: t('prefs.quotes.corner'), sample: qs('「', '」', '『', '』') },
        ]),
        h('p', { class: 'muted small' }, t('prefs.quotes.note'))),
      aiSection(),
      h('section', { class: 'entry-sec' },
        h('h3', null, t('prefs.about')),
        h('div', { class: 'app-info' },
          versionLabel(),
          h('button', {
            class: 'link-btn',
            onclick: async (ev) => {
              const b = ev.currentTarget;
              b.disabled = true;
              const v = await checkUpdate();
              b.disabled = false;
              if (v) showUpdate(); else toast(t('prefs.upToDate'));
            },
          }, t('prefs.checkUpdate'))),
        storageInfo(),
        h('button', { class: 'link-btn', onclick: () => openHelp(PRIVACY) }, t('prefs.whereStored'), h('span', { class: 'ic-inline' }, '›')),
        h('button', { class: 'link-btn', onclick: async () => window.open(feedbackURL(await versionReady()), '_blank', 'noopener') }, t('prefs.feedback'), h('span', { class: 'ic-inline' }, '›')),
        supportLinks().length ? h('button', { class: 'link-btn support-link', onclick: supportSheet }, t('prefs.support')) : null)));
}
