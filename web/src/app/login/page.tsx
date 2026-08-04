'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, type FormState } from '@/app/actions/auth';
import SubmitButton from '@/components/SubmitButton';

const initial: FormState = { error: null };

export default function LoginPage() {
  const [state, action] = useActionState(loginAction, initial);

  return (
    <>
      <h1>Log in</h1>
      <p className="subtitle">Welcome back.</p>

      {state.error && <div className="alert alert-error">{state.error}</div>}

      <form action={action} className="form">
        <div>
          <label htmlFor="username">Username</label>
          <input id="username" name="username" autoComplete="username" required />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <SubmitButton>Log in</SubmitButton>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        No account? <Link href="/signup">Sign up</Link>
      </p>
    </>
  );
}
