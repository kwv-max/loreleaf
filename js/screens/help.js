// 도움말. 필요한 사람만 찾아 읽는 곳. 첫 화면에서 억지로 보여주지 않는다.
import { h, topbar, toast } from '../ui.js';
import { go, back } from '../router.js';
import { startGuide, startTour, TOURS, toursDone } from '../guide.js';
import { insertSample, hasSample } from '../sample.js';
import { feedbackURL } from '../support.js';
import { versionReady } from '../update.js';
import { t, helpTopics } from '../i18n.js';

// 항목 글은 언어별 파일(lang/help.*.js)에. 'privacy'는 다른 화면에서 바로 펼쳐 여는 항목.
export const PRIVACY = 'privacy';

// 다른 화면에서 특정 항목을 펼친 채로 열 때
let openTopic = null;
export function openHelp(id) { openTopic = id; go('/help'); }

export function helpScreen() {
  const again = () => { startGuide(); go('/', { replace: true }); };
  const sample = () => {
    const w = insertSample();
    toast(t('help.sampleAdded'));
    go('/w/' + w.id);
  };
  return h('div', { class: 'screen' },
    topbar({ onBack: () => back('/'), title: t('help.title') }),
    h('main', { class: 'content help' },
      h('p', { class: 'help-lead' }, t('help.lead')),
      h('p', { class: 'help-privacy' }, t('help.privacy')),
      h('div', { class: 'help-actions' },
        h('button', { class: 'btn ghost', onclick: again }, t('help.tutorial')),
        h('button', { class: 'btn ghost', onclick: async () => window.open(feedbackURL(await versionReady()), '_blank', 'noopener') }, t('prefs.feedback')),
        hasSample() ? null : h('button', { class: 'btn ghost', onclick: sample }, t('help.addSample'))),
      // 기능별 '해 보기': 샘플 작품에서 2~3단계씩 직접 해 본다
      h('section', { class: 'tours' },
        h('h3', null, t('help.tours'), h('span', { class: 'muted small' }, t('help.toursSub'))),
        h('div', { class: 'tour-grid' }, TOURS.map((tour) => {
          const done = toursDone().includes(tour.id);
          return h('button', { class: 'tour-card' + (done ? ' done' : ''), onclick: () => startTour(tour.id) },
            h('b', null, tour.title, done ? h('span', { class: 'tour-check' }, ' ✓') : null),
            h('span', null, tour.desc));
        }))),
      helpTopics().map(({ id, title, lines }) => {
        const d = h('details', { class: 'help-topic' + (id === PRIVACY ? ' privacy' : ''), open: id === openTopic },
          h('summary', null, title),
          h('ul', null, lines.map((l) => h('li', null, l))));
        if (id === openTopic) { openTopic = null; setTimeout(() => d.scrollIntoView({ block: 'start' }), 0); }
        return d;
      })));
}
