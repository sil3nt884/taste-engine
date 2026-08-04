import 'server-only';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:8080';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

function extractError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const errorValue = (body as { error: unknown }).error;
    if (typeof errorValue === 'string') return errorValue;
    if (Array.isArray(errorValue)) {
      return errorValue
        .map((issue) => (issue && typeof issue === 'object' && 'message' in issue ? String((issue as { message: unknown }).message) : String(issue)))
        .join('; ');
    }
    if (errorValue != null) return JSON.stringify(errorValue);
  }
  if (typeof body === 'string' && body.trim()) return body;
  return 'Request failed.';
}

export async function apiFetch<T>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    token?: string;
    cache?: RequestCache;
    timeoutMs?: number;
  } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  // Optional timeout so a down/hanging API fails fast for interactive pages.
  // LLM-backed calls (e.g. /search/why) leave it unset to allow slow responses.
  const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: opts.cache ?? 'no-store',
      signal,
    });
  } catch {
    return { ok: false, status: 0, data: null, error: `Cannot reach the API at ${BASE}. Is it running?` };
  }

  const raw = await res.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (!res.ok) {
    return { ok: false, status: res.status, data: null, error: extractError(parsed) };
  }
  return { ok: true, status: res.status, data: parsed as T, error: null };
}
