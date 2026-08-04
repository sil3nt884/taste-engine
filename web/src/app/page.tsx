import type { Metadata } from 'next';
import Link from 'next/link';
import { getMediaPage, searchCatalog } from '@/lib/catalog';
import Cover from '@/components/Cover';
import type { CatalogItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;
const MIN_QUERY = 3;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  if (q) {
    // Query-string result pages are thin and duplicative — keep them out of the
    // index and point ranking signals at the canonical catalogue home.
    return {
      title: `“${q}” — anime search`,
      description: `Anime titles matching “${q}” in the MoodRoll catalogue.`,
      robots: { index: false, follow: true },
      alternates: { canonical: '/' },
    };
  }
  return { alternates: { canonical: '/' } };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const queryText = (sp.q ?? '').trim();
  const searching = queryText.length >= MIN_QUERY;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const data = searching
    ? await searchCatalog(queryText, PAGE_SIZE, offset)
    : await getMediaPage(PAGE_SIZE, offset);

  const results: CatalogItem[] = data?.results ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      <section className="hero hero-compact">
        <h1>
          {searching ? (
            <>
              Results for <span style={{ color: 'var(--accent)' }}>&ldquo;{queryText}&rdquo;</span>
            </>
          ) : (
            <>
              The <span style={{ color: 'var(--accent)' }}>catalogue</span>
            </>
          )}
        </h1>
        <p className="subtitle" style={{ maxWidth: 620 }}>
          {searching ? (
            <>
              Showing titles matching your search.{' '}
              <Link href="/">Clear</Link> to browse the whole catalogue.
            </>
          ) : (
            <>
              Browse every title, most popular first. Search by name in the bar above, or try a{' '}
              <Link href="/search">mood search</Link> to find something by how you want to feel.
            </>
          )}
        </p>
      </section>

      {!data ? (
        <div className="alert alert-error">
          Couldn&rsquo;t load the catalogue. Is the API running?
        </div>
      ) : results.length === 0 ? (
        <div className="empty">
          {searching ? <>No titles match &ldquo;{queryText}&rdquo;.</> : 'Nothing in the catalogue yet.'}
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 14 }}>
            {total.toLocaleString()} {searching ? 'match' : 'title'}
            {total === 1 ? '' : searching ? 'es' : 's'}
          </p>
          <div className="grid">
            {results.map((item) => (
              <MediaCard key={item.media_id} item={item} />
            ))}
          </div>
          <Pager page={page} total={total} pageSize={PAGE_SIZE} query={searching ? queryText : undefined} />
        </>
      )}
    </>
  );
}

function MediaCard({ item }: { item: CatalogItem }) {
  return (
    <Link href={`/media/${item.media_id}`} className="tile">
      <Cover src={item.coverImage ?? null} seed={item.media_id} title={item.title} />
      <div className="tile-body">
        <div className="tile-title">{item.title ?? `#${item.media_id}`}</div>
        <div className="tile-meta">
          {[item.format, item.seasonYear ?? undefined, item.avgScore ? `★ ${item.avgScore}` : undefined]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </Link>
  );
}

function Pager({
  page,
  total,
  pageSize,
  query,
}: {
  page: number;
  total: number;
  pageSize: number;
  query?: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  const href = (targetPage: number) =>
    (query ? `/?q=${encodeURIComponent(query)}&page=${targetPage}` : `/?page=${targetPage}`);
  return (
    <div className="pager">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn btn-sm">
          ← Previous
        </Link>
      ) : (
        <span className="btn btn-sm" aria-disabled style={{ opacity: 0.4 }}>
          ← Previous
        </span>
      )}
      <span className="muted">
        Page {page} of {lastPage.toLocaleString()}
      </span>
      {page < lastPage ? (
        <Link href={href(page + 1)} className="btn btn-sm">
          Next →
        </Link>
      ) : (
        <span className="btn btn-sm" aria-disabled style={{ opacity: 0.4 }}>
          Next →
        </span>
      )}
    </div>
  );
}
