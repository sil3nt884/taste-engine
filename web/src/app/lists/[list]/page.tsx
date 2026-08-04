import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import type { Lists, ListItem, ListName } from '@/lib/types';
import { mutateListAction } from '@/app/actions/lists';
import Cover from '@/components/Cover';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const TABS: { key: ListName; label: string }[] = [
  { key: 'planning', label: 'Plan to watch' },
  { key: 'watched', label: 'Watched' },
];

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ list: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { list } = await params;
  if (list !== 'watched' && list !== 'planning') redirect('/lists/planning');
  const activeList = list as ListName;

  const session = await getSession();
  if (!session) redirect('/login');

  const res = await apiFetch<Lists>('/me/lists', { token: session!.token });
  if (res.status === 401) redirect('/login');

  if (!res.ok || !res.data) {
    return (
      <>
        <h1>My lists</h1>
        <div className="alert alert-error">{res.error ?? 'Could not load your lists.'}</div>
      </>
    );
  }

  const { watched, planning } = res.data;
  const counts: Record<ListName, number> = { watched: watched.length, planning: planning.length };
  const items = activeList === 'watched' ? watched : planning;

  const sp = await searchParams;
  const lastPage = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), lastPage);
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const back = `/lists/${activeList}?page=${page}`;

  return (
    <>
      <h1>My lists</h1>
      <p className="subtitle">
        Signed in as @{session!.username}. Find more from a <Link href="/search">mood search</Link>.
      </p>

      <div className="tabs">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/lists/${tab.key}`}
            className={`tab${tab.key === activeList ? ' active' : ''}`}
          >
            {tab.label} <span className="tab-count">{counts[tab.key]}</span>
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty">Nothing here yet.</div>
      ) : (
        <>
          {pageItems.map((it) => (
            <ListRow key={it.media_id} item={it} list={activeList} back={back} />
          ))}
          <Pager list={activeList} page={page} lastPage={lastPage} />
        </>
      )}
    </>
  );
}

function ListRow({ item, list, back }: { item: ListItem; list: ListName; back: string }) {
  return (
    <article className="card list-row">
      <Link href={`/media/${item.media_id}`}>
        <Cover src={item.coverImage} seed={item.media_id} title={item.title} size="thumb" />
      </Link>
      <div className="list-body">
        <h3>
          <Link href={`/media/${item.media_id}`} className="card-title-link">
            {item.title ?? `#${item.media_id}`}
          </Link>
        </h3>
        <div className="meta">
          {item.episodes != null && <span className="chip">{item.episodes} eps</span>}
          {item.avgScore != null && <span className="chip">avg {item.avgScore}</span>}
          {item.userScore != null && <span className="chip">your score {item.userScore}</span>}
        </div>
        <div className="actions">
          {list === 'planning' && (
            <MoveButton mediaId={item.media_id} to="watched" label="Mark watched" back={back} />
          )}
          {list === 'watched' && (
            <MoveButton mediaId={item.media_id} to="planning" label="Move to planning" back={back} />
          )}
          <RemoveButton mediaId={item.media_id} list={list} back={back} />
        </div>
      </div>
    </article>
  );
}

// Moving = add to the destination list (the API upserts one row per media, so
// re-adding under a new status moves it).
function MoveButton({
  mediaId,
  to,
  label,
  back,
}: {
  mediaId: string;
  to: ListName;
  label: string;
  back: string;
}) {
  return (
    <form action={mutateListAction} className="inline-form">
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="list" value={to} />
      <input type="hidden" name="op" value="add" />
      <input type="hidden" name="back" value={back} />
      <button className="btn btn-sm" type="submit">
        {label}
      </button>
    </form>
  );
}

function RemoveButton({ mediaId, list, back }: { mediaId: string; list: ListName; back: string }) {
  return (
    <form action={mutateListAction} className="inline-form">
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="list" value={list} />
      <input type="hidden" name="op" value="remove" />
      <input type="hidden" name="back" value={back} />
      <button className="btn btn-sm btn-ghost" type="submit">
        Remove
      </button>
    </form>
  );
}

function Pager({ list, page, lastPage }: { list: ListName; page: number; lastPage: number }) {
  if (lastPage <= 1) return null;
  const href = (p: number) => `/lists/${list}?page=${p}`;
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
