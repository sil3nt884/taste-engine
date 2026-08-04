'use server';

import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setSessionToken, clearSession } from '@/lib/session';

export interface FormState {
  error: string | null;
}

async function login(username: string, password: string): Promise<string | null> {
  const res = await apiFetch<{ token: string }>('/login', {
    method: 'POST',
    body: { username, password },
  });
  if (!res.ok || !res.data?.token) return res.error ?? 'Login failed.';
  await setSessionToken(res.data.token);
  return null;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!username || !password) return { error: 'Username and password are required.' };

  const err = await login(username, password);
  if (err) return { error: err };
  redirect('/lists');
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const emailAddress = String(formData.get('emailAddress') ?? '').trim();
  const anilistUser = String(formData.get('anilistUser') ?? '').trim();
  const malUsername = String(formData.get('malUsername') ?? '').trim();

  if (username.length < 3) return { error: 'Username must be at least 3 characters.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (!emailAddress) return { error: 'Email address is required.' };

  const body: Record<string, string> = { username, password, emailAddress };
  if (anilistUser) body.anilistUser = anilistUser;
  if (malUsername) body.malUsername = malUsername;

  const res = await apiFetch<{ id: string; username: string }>('/signup', { method: 'POST', body });
  if (!res.ok) return { error: res.error ?? 'Sign up failed.' };

  const err = await login(username, password);
  if (err) return { error: `Account created, but automatic login failed: ${err}` };
  redirect('/lists');
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/login');
}
