// 환경 설정. 취향이 갈리는 것만 여기에. 항목이 늘어도 한 화면에서 끝나게.
import { h, topbar } from '../ui.js';
import { back } from '../router.js';
import { pref, setPref } from '../prefs.js';

function choice(name, options) {
  const box = h('div', { class: 'choices', role: 'radiogroup' });
  const draw = () => box.replaceChildren(...options.map((o) => h('button', {
    class: 'choice' + (pref(name) === o.value ? ' on' : ''),
    role: 'radio', 'aria-checked': pref(name) === o.value,
    onclick: () => { setPref(name, o.value); draw(); },
  }, h('span', { class: 'choice-sample' }, o.sample), h('span', { class: 'choice-label' }, o.label))));
  draw();
  return box;
}

export function prefsScreen() {
  return h('div', { class: 'screen' },
    topbar({ onBack: () => back('/'), title: '환경 설정' }),
    h('main', { class: 'content entry' },
      h('section', { class: 'entry-sec' },
        h('h3', null, '따옴표 모양'),
        choice('quotes', [
          { value: 'curly', label: '둥근 따옴표', sample: '“가자.” ‘왜?’' },
          { value: 'straight', label: '곧은 따옴표', sample: '"가자." \'왜?\'' },
        ]),
        h('p', { class: 'muted small' }, '줄을 밀어 따옴표를 붙일 때, 그리고 텍스트로 내보낼 때 이 모양으로 맞춰요.'))));
}
