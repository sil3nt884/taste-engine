import type { Metadata } from 'next';
import { getSession } from '@/lib/session';
import MoodSearch from './MoodSearch';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mood Search — Find Anime by How You Want to Feel',
  description:
    'Describe the mood you are after and MoodRoll matches it against a mood-labelled anime catalogue to recommend what to watch next.',
  alternates: { canonical: '/search' },
  openGraph: {
    type: 'website',
    url: '/search',
    title: 'Mood Search — Find Anime by How You Want to Feel',
    description:
      'Describe the mood you are after and MoodRoll recommends anime that match the vibe.',
  },
};

export default async function SearchPage() {
  const session = await getSession();

  return (
    <>
      <h1>Mood search</h1>
      <p className="subtitle">
        Describe the vibe you&rsquo;re after — the engine matches it against a mood-labelled
        catalogue.{session ? ' Results are personalised to your taste.' : ''}
      </p>

      <MoodSearch isAuthenticated={!!session} />
    </>
  );
}
