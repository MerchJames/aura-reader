/**
 * Minimal client for any OpenAI-compatible endpoint (OpenAI, OpenRouter,
 * LM Studio, Ollama, llama.cpp, KoboldCpp…). Given whatever base URL the user
 * pastes, we probe for the working prefix (`/v1` or bare) so they don't have to
 * know it, then talk to `/models` and `/chat/completions`.
 */

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const stripEnd = (u: string) => u.replace(/\/+$/, '');

/** Candidate base URLs to try, most-likely first. */
export const candidateBases = (raw: string): string[] => {
  let b = stripEnd((raw || '').trim());
  // Drop a pasted endpoint path so we can re-derive it.
  b = stripEnd(b.replace(/\/(chat\/completions|completions|models)$/i, ''));
  const out: string[] = [];
  const add = (x: string) => { if (x && !out.includes(x)) out.push(x); };
  if (/\/v\d+$/.test(b)) add(b);         // already versioned
  else { add(`${b}/v1`); add(b); }       // try /v1 first, then bare
  return out;
};

const authHeaders = (key: string): Record<string, string> =>
  key ? { Authorization: `Bearer ${key}` } : {};

/** Fetch the model list; returns the models and the base that answered. */
export const listModels = async (
  raw: string, key: string,
): Promise<{ models: string[]; base: string }> => {
  let lastErr: unknown;
  for (const base of candidateBases(raw)) {
    try {
      const res = await fetch(`${base}/models`, { headers: authHeaders(key) });
      if (!res.ok) { lastErr = new Error(`${res.status} ${res.statusText}`); continue; }
      const data = await res.json();
      const rows = Array.isArray(data?.data) ? data.data
        : Array.isArray(data?.models) ? data.models
        : Array.isArray(data) ? data : [];
      const models = rows
        .map((m: any) => (typeof m === 'string' ? m : m?.id ?? m?.name))
        .filter(Boolean);
      return { models, base };
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not reach the endpoint.');
};

/** Non-streaming chat completion. */
export const chatCompletion = async (
  base: string, key: string, model: string, messages: ChatMsg[], signal?: AbortSignal,
): Promise<string> => {
  const res = await fetch(`${stripEnd(base)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(key) },
    body: JSON.stringify({ model, messages, stream: false }),
    signal,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); detail = j?.error?.message ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
};
