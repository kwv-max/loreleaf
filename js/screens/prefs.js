// 환경 설정. 취향이 갈리는 것만 여기에. 항목이 늘어도 한 화면에서 끝나게.
import { h, topbar, toast } from '../ui.js';
import { versionReady, checkUpdate, showUpdate } from '../update.js';
import { back } from '../router.js';
import { pref, setPref, ACCENTS, applyAccent, applyTheme, applyText, isDark } from '../prefs.js';

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
  const box = h('div', { class: 'accent-row', role: 'radiogroup', 'aria-label': '포인트 색' });
  const draw = () => box.replaceChildren(...ACCENTS.map(([key, label, l, , d]) => h('button', {
    class: 'accent-opt' + (pref('accent') === key ? ' on' : ''),
    role: 'radio', 'aria-checked': pref('accent') === key,
    onclick: () => { setPref('accent', key); applyAccent(key); draw(); },
  }, h('span', { class: 'swatch', style: `--c:${isDark() ? d : l}` }), h('span', { class: 'accent-label' }, label))));
  draw();
  redrawAccents = draw;
  return box;
}
let redrawAccents = () => {};

// 에디터 글자 크기·줄 간격·글꼴. 바꾸면 아래 미리보기에 바로 보인다.
function textPrefs() {
  const preview = h('div', { class: 'text-preview' },
    '눈은 밤새 그치지 않았다. 유나는 성벽 위에 서서 숨을 내쉬었다.\n“또 밤 순찰이야?”');
  const pick = (name, options) => choice(name, options, () => applyText());
  return h('div', { class: 'text-prefs' },
    pick('edSize', [
      { value: 's', label: '작게', sample: h('span', { style: 'font-size:15px' }, '가') },
      { value: 'm', label: '보통', sample: h('span', { style: 'font-size:17px' }, '가') },
      { value: 'l', label: '크게', sample: h('span', { style: 'font-size:19px' }, '가') },
      { value: 'xl', label: '아주 크게', sample: h('span', { style: 'font-size:21px' }, '가') },
    ]),
    pick('edLine', [
      { value: 'normal', label: '보통 줄 간격', sample: '≡' },
      { value: 'wide', label: '넓은 줄 간격', sample: '☰' },
    ]),
    pick('edFont', [
      { value: 'sans', label: '고딕', sample: h('span', { style: 'font-family:var(--font)' }, '갈피') },
      { value: 'serif', label: '명조', sample: h('span', { style: 'font-family:"Noto Serif KR","Noto Serif CJK KR","Nanum Myeongjo","AppleMyungjo","Batang",serif' }, '갈피') },
    ]),
    preview,
    h('p', { class: 'muted small' }, '글 쓰는 화면에만 적용돼요. 명조는 처음 고를 때 글꼴을 한 번 받아 와요(인터넷 필요). 그 뒤로는 오프라인에서도 돼요.'));
}

function versionLabel() {
  const el = h('span', null, '갈피');
  versionReady().then((v) => { if (v) el.textContent = `갈피 ${v}`; });
  return el;
}

export function prefsScreen() {
  return h('div', { class: 'screen' },
    topbar({ onBack: () => back('/'), title: '환경 설정' }),
    h('main', { class: 'content entry' },
      h('section', { class: 'entry-sec' },
        h('h3', null, '화면 모드'),
        choice('theme', [
          { value: 'system', label: '휴대폰 설정 따르기', sample: '자동' },
          { value: 'light', label: '늘 밝게', sample: '밝게' },
          { value: 'dark', label: '늘 어둡게', sample: '어둡게' },
        ], (v) => { applyTheme(v); redrawAccents(); })),
      h('section', { class: 'entry-sec' },
        h('h3', null, '글자'),
        textPrefs()),
      h('section', { class: 'entry-sec' },
        h('h3', null, '하루 목표'),
        choice('goal', [
          { value: 0, label: '안 정함', sample: '—' },
          { value: 2000, label: '하루', sample: '2천' },
          { value: 5000, label: '하루', sample: '5천' },
          { value: 10000, label: '하루', sample: '1만' },
        ]),
        h('p', { class: 'muted small' }, '정해 두면 작품 목록에 오늘 쓴 만큼 막대가 차요. 알림은 보내지 않아요.')),
      h('section', { class: 'entry-sec' },
        h('h3', null, '포인트 색'),
        accentPicker(),
        h('p', { class: 'muted small' }, '버튼, 강조 표시, 바뀐 설정의 점 같은 곳에 쓰이는 색이에요. 캐릭터 형광펜 색은 따로예요.')),
      h('section', { class: 'entry-sec' },
        h('h3', null, '따옴표 모양'),
        choice('quotes', [
          { value: 'curly', label: '둥근 따옴표', sample: '“가자.” ‘왜?’' },
          { value: 'straight', label: '곧은 따옴표', sample: '"가자." \'왜?\'' },
          { value: 'corner', label: '낫표', sample: '「가자.」『왜?』' },
        ]),
        h('p', { class: 'muted small' }, '대사 줄 여백에 보이는 모양이고, 텍스트로 내보내거나 복사할 때도 이 모양으로 붙어요.')),
      h('section', { class: 'entry-sec' },
        h('h3', null, '앱 정보'),
        h('div', { class: 'app-info' },
          versionLabel(),
          h('button', {
            class: 'link-btn',
            onclick: async (ev) => {
              const b = ev.currentTarget;
              b.disabled = true;
              const v = await checkUpdate();
              b.disabled = false;
              if (v) showUpdate(); else toast('최신 버전이에요.');
            },
          }, '업데이트 확인')))));
}
