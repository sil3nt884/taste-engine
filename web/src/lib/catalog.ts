import 'server-only';
import { apiFetch } from './api';
import type { CatalogSearchResponse, MediaDetail, MediaPage } from './types';

export async function getMediaPage(limit: number, offset: number): Promise<MediaPage | null> {
  const res = await apiFetch<MediaPage>(`/media?limit=${limit}&offset=${offset}`, {
    timeoutMs: 6000,
  });
  return res.ok ? res.data : null;
}

export async function searchCatalog(
  q: string,
  limit: number,
  offset: number,
): Promise<CatalogSearchResponse | null> {
  const res = await apiFetch<CatalogSearchResponse>('/searchCatalog', {
    method: 'POST',
    body: { q, limit, offset },
    timeoutMs: 6000,
  });
  return res.ok ? res.data : null;
}

export async function getMediaById(id: string): Promise<MediaDetail | null> {
  const res = await apiFetch<MediaDetail>(`/media/${encodeURIComponent(id)}`, { timeoutMs: 6000 });
  return res.ok ? res.data : null;
}
