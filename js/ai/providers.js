// AI 회사별 차이를 여기 모은다. 지금은 키 확인과 모델 목록.
// 모델 목록은 하드코딩하지 않고 각 회사의 목록 API에서 받아 온다 (새 모델이 나와도 앱을 고칠 필요가 없게).
// 비용 안내(저렴/보통/비쌈)만 이름 모양으로 어림한다.

// Claude는 공식 SDK를 쓴다. 무거워서 Claude를 고른 사람만, 버전을 고정해 받아 온다.
const ANTHROPIC_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
let sdk = null;
const anthropicSDK = async () => (sdk ||= (await import(ANTHROPIC_SDK)).default);

export class AiError extends Error {
  constructor(kind, message = '') { super(message || kind); this.kind = kind; } // kind: 'key' | 'network' | 'other'
}

// fetch로 부르는 회사(OpenAI, Gemini)의 오류를 같은 모양으로
async function getJSON(url, headers) {
  let r;
  try { r = await fetch(url, { headers }); } catch { throw new AiError('network'); }
  let body = null;
  try { body = await r.json(); } catch {}
  if (r.ok) return body;
  const msg = body?.error?.message || `HTTP ${r.status}`;
  const badKey = r.status === 401 || r.status === 403 || /api[_ ]?key/i.test(msg);
  throw new AiError(badKey ? 'key' : 'other', msg);
}

export const PROVIDERS = {
  anthropic: {
    name: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    cost: (id) => (/fable|mythos/.test(id) ? 'top' : /opus/.test(id) ? 'high' : /sonnet/.test(id) ? 'mid' : /haiku/.test(id) ? 'low' : null),
    async listModels(key) {
      const Anthropic = await anthropicSDK().catch(() => { throw new AiError('network'); });
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
      const out = [];
      try {
        for await (const m of client.models.list()) out.push({ id: m.id, label: m.display_name || m.id });
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiError('key', e.message);
        if (e instanceof Anthropic.APIConnectionError) throw new AiError('network', e.message);
        throw new AiError('other', e.message);
      }
      return out; // 새 모델이 앞에
    },
  },
  openai: {
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    cost: (id) => (/nano|mini/.test(id) ? 'low' : /-pro\b|^o\d+-pro/.test(id) ? 'top' : null),
    async listModels(key) {
      const body = await getJSON('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` });
      return (body.data || [])
        // 글을 읽고 답하는 모델만 (음성·이미지·임베딩 등은 빼고, 날짜가 붙은 고정판도 뺀다)
        .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id))
        .filter((m) => !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation|codex|computer|deep-research|-\d{4}-\d{2}-\d{2}$|-\d{4}$)/.test(m.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .map((m) => ({ id: m.id, label: m.id }));
    },
  },
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
    cost: (id) => (/flash/.test(id) ? 'low' : /pro/.test(id) ? 'mid' : null),
    async listModels(key) {
      const body = await getJSON('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': key });
      return (body.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => ({ ...m, id: m.name.replace(/^models\//, '') }))
        .filter((m) => /^gemini-/.test(m.id) && !/(embedding|tts|image|live|audio|robotics|computer-use|aqa)/.test(m.id))
        .map((m) => ({ id: m.id, label: m.displayName || m.id }));
    },
  },
};
