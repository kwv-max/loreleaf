// AI 회사별 차이를 여기 모은다: 키 확인·모델 목록, 그리고 한 차례 주고받기(turn).
// 모델 목록은 하드코딩하지 않고 각 회사의 목록 API에서 받아 온다 (새 모델이 나와도 앱을 고칠 필요가 없게).
// 비용 안내(저렴/보통/비쌈)만 이름 모양으로 어림한다.
//
// 대화는 회사와 상관없는 모양으로 들고 다니고, 보낼 때만 회사 모양으로 바꾼다.
//   { role: 'user', text }
//   { role: 'assistant', text, calls: [{ id, name, input }], raw }   raw: 그 회사가 돌려준 원래 모양 (그대로 되돌려 보내야 하는 것이 있어서)
//   { role: 'tools', results: [{ id, name, output, error }] }
// turn()은 { text, calls, raw, usage: { in, out } }를 돌려준다.

// Claude는 공식 SDK를 쓴다. 무거워서 Claude를 고른 사람만, 버전을 고정해 받아 온다.
const ANTHROPIC_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
let sdk = null;
const anthropicSDK = async () => {
  try { return (sdk ||= (await import(ANTHROPIC_SDK)).default); } catch { throw new AiError('network'); }
};

export class AiError extends Error {
  constructor(kind, message = '') { super(message || kind); this.kind = kind; } // kind: 'key' | 'network' | 'refused' | 'aborted' | 'other'
}

// fetch로 부르는 회사(OpenAI, Gemini)의 오류를 같은 모양으로
async function callJSON(url, { headers, body, signal } = {}) {
  let r;
  try {
    r = await fetch(url, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal }
      : { headers, signal });
  } catch (e) { throw new AiError(e.name === 'AbortError' ? 'aborted' : 'network'); }
  let data = null;
  try { data = await r.json(); } catch {}
  if (r.ok) return data;
  const msg = data?.error?.message || `HTTP ${r.status}`;
  const badKey = r.status === 401 || r.status === 403 || /api[_ ]?key/i.test(msg);
  throw new AiError(badKey ? 'key' : 'other', msg);
}

const MAX_TOKENS = 16000;
const schema = (tool, upper = false) => {
  const ty = (s) => (upper ? s.toUpperCase() : s);
  if (!Object.keys(tool.params).length) return null;
  return {
    type: ty('object'),
    properties: Object.fromEntries(Object.entries(tool.params).map(([k, v]) => [k, { type: ty(v.type), description: v.description }])),
    required: tool.required || [],
  };
};

export const PROVIDERS = {
  anthropic: {
    name: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    cost: (id) => (/fable|mythos/.test(id) ? 'top' : /opus/.test(id) ? 'high' : /sonnet/.test(id) ? 'mid' : /haiku/.test(id) ? 'low' : null),
    async listModels(key) {
      const Anthropic = await anthropicSDK();
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
      const out = [];
      try {
        for await (const m of client.models.list()) out.push({ id: m.id, label: m.display_name || m.id });
      } catch (e) { throw anthropicError(Anthropic, e); }
      return out; // 새 모델이 앞에
    },
    async turn({ key, model, system, messages, tools, noTools = false, signal }) {
      const Anthropic = await anthropicSDK();
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
      let res;
      try {
        res = await client.messages.create({
          model, max_tokens: MAX_TOKENS, system,
          ...(noTools ? { tool_choice: { type: 'none' } } : {}),
          cache_control: { type: 'ephemeral' }, // 도구를 부를 때마다 앞부분(설명·도구·지난 대화)을 다시 보내니, 캐시로 비용을 줄인다
          tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: schema(t) || { type: 'object', properties: {} } })),
          messages: messages.map((m) => {
            if (m.role === 'user') return { role: 'user', content: m.text };
            if (m.role === 'assistant') return { role: 'assistant', content: m.raw };
            return { role: 'user', content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.output, ...(r.error ? { is_error: true } : {}) })) };
          }),
        }, { signal });
      } catch (e) { throw anthropicError(Anthropic, e); }
      if (res.stop_reason === 'refusal') throw new AiError('refused');
      return {
        text: res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
        calls: res.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input || {} })),
        raw: res.content,
        usage: { in: (res.usage.input_tokens || 0) + (res.usage.cache_read_input_tokens || 0) + (res.usage.cache_creation_input_tokens || 0), out: res.usage.output_tokens || 0 },
      };
    },
  },
  openai: {
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    cost: (id) => (/nano|mini/.test(id) ? 'low' : /-pro\b|^o\d+-pro/.test(id) ? 'top' : null),
    async listModels(key) {
      const body = await callJSON('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      return (body.data || [])
        // 글을 읽고 답하는 모델만 (음성·이미지·임베딩 등은 빼고, 날짜가 붙은 고정판도 뺀다)
        .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id))
        .filter((m) => !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation|codex|computer|deep-research|-\d{4}-\d{2}-\d{2}$|-\d{4}$)/.test(m.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .map((m) => ({ id: m.id, label: m.id }));
    },
    async turn({ key, model, system, messages, tools, noTools = false, signal }) {
      const res = await callJSON('https://api.openai.com/v1/chat/completions', {
        headers: { Authorization: `Bearer ${key}` }, signal,
        body: {
          model,
          ...(noTools ? { tool_choice: 'none' } : {}),
          tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: schema(t) || { type: 'object', properties: {} } } })),
          messages: [{ role: 'system', content: system }, ...messages.flatMap((m) => {
            if (m.role === 'user') return [{ role: 'user', content: m.text }];
            if (m.role === 'assistant') return [m.raw];
            return m.results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.output }));
          })],
        },
      });
      const msg = res.choices?.[0]?.message;
      if (!msg) throw new AiError('other', 'empty response');
      if (msg.refusal) throw new AiError('refused', msg.refusal);
      const calls = (msg.tool_calls || []).filter((c) => c.type === 'function').map((c) => {
        let input = {};
        try { input = JSON.parse(c.function.arguments || '{}'); } catch {}
        return { id: c.id, name: c.function.name, input };
      });
      return {
        text: (msg.content || '').trim(), calls,
        raw: { role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) },
        usage: { in: res.usage?.prompt_tokens || 0, out: res.usage?.completion_tokens || 0 },
      };
    },
  },
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
    cost: (id) => (/flash/.test(id) ? 'low' : /pro/.test(id) ? 'mid' : null),
    async listModels(key) {
      const body = await callJSON('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } });
      return (body.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => ({ ...m, id: m.name.replace(/^models\//, '') }))
        // 글 모델(pro·flash·flash-lite)만 이름 모양으로 골라낸다. 영상(gemini-omni…)·이미지·음성 모델도 generateContent를 지원해서 방법만으로는 못 거른다
        .filter((m) => /^gemini-(\d+(\.\d+)?-)?(pro|flash|flash-lite)(-|$)/.test(m.id))
        .filter((m) => !/(embedding|tts|image|live|audio|video|omni|robotics|computer-use|aqa|native)/.test(m.id))
        .map((m) => ({ id: m.id, label: m.displayName || m.id }));
    },
    async turn({ key, model, system, messages, tools, noTools = false, signal }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        ...(noTools ? { toolConfig: { functionCallingConfig: { mode: 'NONE' } } } : {}),
        tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, ...(schema(t, true) ? { parameters: schema(t, true) } : {}) })) }],
        contents: messages.map((m) => {
          if (m.role === 'user') return { role: 'user', parts: [{ text: m.text }] };
          if (m.role === 'assistant') return m.raw; // 생각 서명(thoughtSignature)까지 그대로 돌려보내야 한다
          return { role: 'user', parts: m.results.map((r) => ({ functionResponse: { name: r.name, ...(r.gid ? { id: r.gid } : {}), response: r.error ? { error: r.output } : { result: r.output } } })) };
        }),
      };
      const usage = { in: 0, out: 0 };
      // 가벼운 모델은 도구 호출 모양을 가끔 망가뜨리거나(MALFORMED_FUNCTION_CALL) 아무것도 없이 끝낸다. 그럴 땐 두 번까지 다시.
      for (let attempt = 0; ; attempt++) {
        const res = await callJSON(url, { headers: { 'x-goog-api-key': key }, signal, body });
        usage.in += res.usageMetadata?.promptTokenCount || 0;
        usage.out += (res.usageMetadata?.candidatesTokenCount || 0) + (res.usageMetadata?.thoughtsTokenCount || 0);
        const cand = res.candidates?.[0];
        if (!cand) throw new AiError(res.promptFeedback?.blockReason ? 'refused' : 'other', res.promptFeedback?.blockReason || 'empty response');
        const parts = cand.content?.parts || [];
        const why = cand.finishReason || '';
        const calls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: `g${i}`, gid: p.functionCall.id, name: p.functionCall.name, input: p.functionCall.args || {} }));
        const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
        if (!calls.length && !text) {
          if (/SAFETY|PROHIBITED|BLOCKLIST|RECITATION|SPII/.test(why)) throw new AiError('refused', why);
          if (attempt < 2) continue;
          throw new AiError('other', `empty answer${why ? ` (${why})` : ''}`);
        }
        return { text, calls, raw: { role: 'model', parts }, usage };
      }
    },
  },
};

function anthropicError(Anthropic, e) {
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('aborted');
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('key', e.message);
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network', e.message);
  return new AiError('other', e.message);
}
