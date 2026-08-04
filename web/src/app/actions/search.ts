'use server';

import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import type { Recommendation, MoodSearchState } from '@/lib/types';

export async function moodSearchAction(
  _prev: MoodSearchState,
  formData: FormData,
): Promise<MoodSearchState> {
  const query = String(formData.get('query') ?? '').trim();
  const limit = Math.min(50, Math.max(1, Number(formData.get('limit')) || 20));
  if (!query) return { query: '', recs: [], error: null, submitted: true };

  const session = await getSession();
  const res = await apiFetch<Recommendation[]>('/search', {
    method: 'POST',
    token: session?.token,
    body: { query, limit, explain: false },
  });

  if (res.ok && res.data) return { query, recs: res.data, error: null, submitted: true };
  return { query, recs: [], error: res.error, submitted: true };
}
