'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Recommendation, WhyResult } from '@/lib/types';
import { mutateListAction } from '@/app/actions/lists';

export default function Results({
  recs,
  query,
  isAuthenticated,
}: {
  recs: Recommendation[];
  query: string;
  isAuthenticated: boolean;
}) {
  const [whys, setWhys] = useState<Record<string, string>>({});
  const [loadingWhy, setLoadingWhy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingWhy(true);
    setWhys({});

    fetch('/api/why', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        items: recs.map((rec) => ({
          media_id: rec.media_id,
          title: rec.title,
          description: rec.description,
        })),
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { whys: WhyResult[] }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const whyResult of data.whys ?? []) map[whyResult.media_id] = whyResult.why;
        setWhys(map);
      })
      .catch(() => {
      })
      .finally(() => {
        if (!cancelled) setLoadingWhy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, recs]);

  return (
    <>
      <h2>
        {recs.length} result{recs.length === 1 ? '' : 's'}
      </h2>
      {recs.map((rec) => {
        const aiWhy = whys[rec.media_id];
        return (
          <article key={rec.media_id} className="card">
            <h3>
              <Link href={`/media/${rec.media_id}`} className="card-title-link">
                {rec.title}
              </Link>
            </h3>
            {rec.description && <p className="desc">{rec.description}</p>}
            <p className={`why${!aiWhy && loadingWhy ? ' loading' : ''}`}>
              {aiWhy ?? (loadingWhy ? 'Generating reason…' : rec.why)}
            </p>

            {isAuthenticated ? (
              <div className="actions">
                <span className="label">Add to:</span>
                <AddButton mediaId={rec.media_id} list="planning" label="Plan to watch" />
                <AddButton mediaId={rec.media_id} list="watched" label="Watched" />
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                <a href="/login">Log in</a> to add to your lists.
              </p>
            )}
          </article>
        );
      })}
    </>
  );
}

function AddButton({
  mediaId,
  list,
  label,
}: {
  mediaId: string;
  list: 'watched' | 'planning';
  label: string;
}) {
  return (
    <form action={mutateListAction} className="inline-form">
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="list" value={list} />
      <input type="hidden" name="op" value="add" />
      <input type="hidden" name="back" value="/search" />
      <button className="btn btn-sm" type="submit">
        + {label}
      </button>
    </form>
  );
}
