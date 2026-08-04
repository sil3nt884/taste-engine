import { Suspense } from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { logoutAction } from '@/app/actions/auth';
import NavSearch from '@/components/NavSearch';

export default async function Nav() {
  const session = await getSession();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          Mood<span>Roll</span>
        </Link>

        <Suspense fallback={<div className="navsearch" />}>
          <NavSearch />
        </Suspense>

        <div className="nav-links">
          <Link href="/search">Mood</Link>
          <Link href="/lists">My Lists</Link>
          {session ? (
            <>
              <span className="muted">@{session.username}</span>
              <form action={logoutAction} className="inline-form">
                <button className="btn btn-sm btn-ghost" type="submit">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
