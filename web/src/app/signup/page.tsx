'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signupAction, type FormState } from '@/app/actions/auth';
import SubmitButton from '@/components/SubmitButton';

const initial: FormState = { error: null };

export default function SignupPage() {
  const [state, action] = useActionState(signupAction, initial);

  return (
    <>
      <h1>Create an account</h1>
      <p className="subtitle">
        Link an AniList or MyAnimeList handle to personalise your recommendations (optional).
      </p>

      {state.error && <div className="alert alert-error">{state.error}</div>}

      <form action={action} className="form">
        <div>
          <label htmlFor="username">Username *</label>
          <input id="username" name="username" minLength={3} maxLength={50} required />
        </div>
        <div>
          <label htmlFor="emailAddress">Email address *</label>
          <input id="emailAddress" name="emailAddress" type="email" required />
        </div>
        <div>
          <label htmlFor="password">Password * (min 8 characters)</label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label htmlFor="anilistUser">AniList username (optional)</label>
          <input id="anilistUser" name="anilistUser" maxLength={50} />
        </div>
        <div>
          <label htmlFor="malUsername">MyAnimeList username (optional)</label>
          <input id="malUsername" name="malUsername" maxLength={50} />
        </div>
        <SubmitButton>Sign up</SubmitButton>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </>
  );
}
