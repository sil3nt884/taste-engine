import type { MetadataRoute } from 'next';
import { apiFetch } from '@/lib/api';
import { SITE_URL } from '@/lib/seo';
import type { MediaPage } from '@/lib/types';

export const revalidate = 86400;

const PAGE_SIZE = 100;
const MAX_TITLES = 20000;

async function mediaEntries(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  for (let offset = 0; offset < MAX_TITLES; offset += PAGE_SIZE) {
    const res = await apiFetch<MediaPage>(`/media?limit=${PAGE_SIZE}&offset=${offset}`, {
      cache: 'force-cache',
      timeoutMs: 6000,
    });
    const results = res.ok ? (res.data?.results ?? []) : [];
    if (results.length === 0) break;
    for (const item of results) {
      entries.push({
        url: `${SITE_URL}/media/${item.media_id}`,
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
    if (results.length < PAGE_SIZE) break;
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'weekly', priority: 0.9 },
  ];
  return [...staticRoutes, ...await mediaEntries()];
}
