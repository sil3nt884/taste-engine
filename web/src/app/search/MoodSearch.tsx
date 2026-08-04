'use client';

import { useActionState } from 'react';
import { moodSearchAction } from '@/app/actions/search';
import { initialMoodSearch } from '@/lib/types';
import SubmitButton from '@/components/SubmitButton';
import Results from './Results';

export default function MoodSearch({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [state, action] = useActionState(moodSearchAction, initialMoodSearch);

  return (
    <>
      <form action={action} className="panel" style={{ marginBottom: 24 }}>
        <div className="row">
          <div className="grow">
            <label htmlFor="query">Mood query</label>
            <input
              id="query"
              name="query"
              defaultValue={state.query}
              placeholder="cozy slice of life to wind down after work"
              required
            />
          </div>
          <div style={{ flex: '0 0 120px' }}>
            <label htmlFor="limit">Results</label>
            <input id="limit" name="limit" type="number" min={1} max={50} defaultValue={20} />
          </div>
          <SubmitButton>Search</SubmitButton>
        </div>
      </form>

      {state.error && <div className="alert alert-error">{state.error}</div>}

      {!state.submitted && (
        <div className="empty">Enter a mood above to get recommendations.</div>
      )}

      {state.submitted && !state.error && state.recs.length === 0 && (
        <div className="empty">
          No matches{state.query ? ` for “${state.query}”` : ''}. Try a different mood.
        </div>
      )}

      {state.recs.length > 0 && (
        <Results recs={state.recs} query={state.query} isAuthenticated={isAuthenticated} />
      )}
    </>
  );
}
