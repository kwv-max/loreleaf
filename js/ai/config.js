// AI 도우미 설정. 기본은 꺼짐. 키는 사용자 본인 것(BYOK)이고 이 기기에만 둔다 (백업 파일에도 넣지 않는다).
//   { on, provider: 'anthropic'|'openai'|'gemini', keys: { [provider]: 키 }, model: { [provider]: 모델 id }, models: { [provider]: 받아 온 목록 } }
const KEY = 'll:ai';

export function aiConfig() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  return { on: false, provider: 'anthropic', keys: {}, model: {}, models: {}, ...c };
}

export function setAi(patch) {
  const c = { ...aiConfig(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {}
  return c;
}

// 회사별 값 하나만 바꾸기: setAiFor('keys', 'openai', 'sk-…')
export function setAiFor(field, provider, value) {
  const c = aiConfig();
  const next = { ...c[field] };
  if (value == null) delete next[provider]; else next[provider] = value;
  return setAi({ [field]: next });
}

// 지금 물어볼 수 있는 상태인지 (켜져 있고, 키와 모델이 있음)
export function aiReady() {
  const c = aiConfig();
  return c.on && !!c.keys[c.provider] && !!c.model[c.provider];
}
