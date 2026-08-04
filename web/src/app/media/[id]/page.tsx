import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getMediaById } from '@/lib/catalog';
import { getSession } from '@/lib/session';
import { mutateListAction } from '@/app/actions/lists';
import Cover from '@/components/Cover';
import { SITE_NAME, SITE_URL } from '@/lib/seo';
import type { ListName, MediaDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Deduped so generateMetadata and the page share one API call per request.
const loadMedia = cache((id: string) => getMediaById(id));

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

function displayTitle(item: MediaDetail): string {
  return item.title ?? item.titleRomaji ?? item.titleEnglish ?? `Anime #${item.media_id}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await loadMedia(id);
  if (!item) {
    return { title: 'Title not found', robots: { index: false, follow: false } };
  }

  const title = displayTitle(item);
  const facts = [item.format, item.seasonYear ?? undefined, item.episodes ? `${item.episodes} eps` : undefined]
    .filter(Boolean)
    .join(' · ');
  const description = item.description
    ? clip(item.description, 155)
    : `${title}${facts ? ` (${facts})` : ''} on MoodRoll — synopsis, score, and mood-matched anime like it.`;
  const canonical = `/media/${item.media_id}`;
  const images = item.coverImage ? [{ url: item.coverImage, alt: title }] : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'video.tv_show',
      siteName: SITE_NAME,
      url: canonical,
      title: facts ? `${title} (${facts})` : title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: item.coverImage ? [item.coverImage] : undefined,
    },
  };
}

function jsonLd(item: MediaDetail) {
  const title = displayTitle(item);
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': item.format === 'MOVIE' ? 'Movie' : 'TVSeries',
    name: title,
    url: `${SITE_URL}/media/${item.media_id}`,
  };
  if (item.titleRomaji && item.titleRomaji !== title) data.alternateName = item.titleRomaji;
  if (item.description) data.description = clip(item.description, 5000);
  if (item.coverImage) data.image = item.coverImage;
  if (item.episodes != null) data.numberOfEpisodes = item.episodes;
  if (item.seasonYear != null) data.datePublished = String(item.seasonYear);
  if (item.avgScore != null && item.popularity != null && item.popularity > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: item.avgScore,
      bestRating: 100,
      worstRating: 0,
      ratingCount: item.popularity,
    };
  }
  return data;
}

export default async function MediaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await loadMedia(id);
  const session = await getSession();

  if (!item) {
    return (
      <>
        <p style={{ marginTop: 24 }}>
          <Link href="/">← Back to catalogue</Link>
        </p>
        <div className="empty">We couldn&rsquo;t find that title in the catalogue.</div>
      </>
    );
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(item)) }}
      />
      <p style={{ marginTop: 24 }}>
        <Link href="/">← Back to catalogue</Link>
      </p>

      <div className="detail">
        <Cover src={item.coverImage ?? null} seed={item.media_id} title={item.title} size="detail" />
        <div className="detail-body">
          <h1 style={{ marginTop: 0 }}>{item.title ?? `#${item.media_id}`}</h1>
          {item.titleRomaji && item.titleRomaji !== item.title && (
            <p className="muted" style={{ marginTop: -2 }}>
              {item.titleRomaji}
            </p>
          )}
          <div className="meta">
            {item.format && <span className="chip">{item.format}</span>}
            {item.status && <span className="chip">{item.status}</span>}
            {item.season && item.seasonYear != null && (
              <span className="chip">
                {item.season} {item.seasonYear}
              </span>
            )}
            {item.episodes != null && <span className="chip">{item.episodes} eps</span>}
            {item.avgScore != null && <span className="chip">★ {item.avgScore}</span>}
          </div>

          {item.description ? (
            <p style={{ color: 'var(--text)', marginTop: 16 }}>{item.description}</p>
          ) : (
            <p className="muted" style={{ marginTop: 16 }}>
              No synopsis available.
            </p>
          )}

          {session ? (
            <div className="actions" style={{ marginTop: 20 }}>
              <span className="label">Add to:</span>
              <AddButton mediaId={item.media_id} list="planning" label="Plan to watch" />
              <AddButton mediaId={item.media_id} list="watched" label="Watched" />
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 20 }}>
              <Link href="/login">Log in</Link> to add this to your lists.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function AddButton({ mediaId, list, label }: { mediaId: string; list: ListName; label: string }) {
  return (
    <form action={mutateListAction} className="inline-form">
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="list" value={list} />
      <input type="hidden" name="op" value="add" />
      <input type="hidden" name="back" value={`/media/${mediaId}`} />
      <button className="btn btn-sm" type="submit">
        + {label}
      </button>
    </form>
  );
}
