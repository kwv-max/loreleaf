// 이 기기의 환경 설정. 작품 데이터가 아니라 쓰는 사람의 취향이라 localStorage에 둔다.
const KEY = 'll:prefs';
const DEFAULTS = { quotes: 'curly' }; // 'curly' = “ ” ‘ ’, 'straight' = " '

export function pref(name) {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }[name]; } catch { return DEFAULTS[name]; }
}

export function setPref(name, value) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    all[name] = value;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
