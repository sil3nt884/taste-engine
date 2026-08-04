import { config } from '../config.js';
import type { OllamaChatResponse, JsonSchema } from '../types';

/**
 * Request headers for Ollama, adding a bearer when OLLAMA_TOKEN is set — so a
 * reverse proxy in front of a home/DDNS-exposed Ollama (which has no auth of its
 * own) can reject anything without the token.
 */
export function ollamaHeaders(base: Record<string, string> = {}): Record<string, string> {
  return config.OLLAMA_TOKEN ? { ...base, Authorization: `Bearer ${config.OLLAMA_TOKEN}` } : base;
}

export async function chatJSON(
  system: string,
  user: string,
  schema: JsonSchema,
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<unknown> {
  const res = await fetch(`${config.OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: ollamaHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: opts.model ?? config.OLLAMA_MODEL,
      stream: false,
      format: schema,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`ollama ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as OllamaChatResponse;
  if (body.error) throw new Error(`ollama: ${body.error}`);
  const content = body.message?.content;
  if (!content) throw new Error('ollama: empty response');

  return JSON.parse(content);
}

/** Fail fast with a clear message if the model has not been pulled. */
export async function assertModelAvailable(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${config.OLLAMA_HOST}/api/tags`, { headers: ollamaHeaders() });
  } catch {
    throw new Error(
      `cannot reach Ollama at ${config.OLLAMA_HOST}. Is it running? (\`ollama serve\`)`,
    );
  }
  const { models } = (await res.json()) as { models?: Array<{ name: string }> };
  const have = (models ?? []).some(
    (model) => model.name === config.OLLAMA_MODEL || model.name.startsWith(`${config.OLLAMA_MODEL}:`),
  );
  if (!have) {
    throw new Error(
      `model "${config.OLLAMA_MODEL}" not found. Pull it: \`ollama pull ${config.OLLAMA_MODEL}\``,
    );
  }
}
