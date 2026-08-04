'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import type { ListName } from '@/lib/types';

export async function mutateListAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/login');

  const mediaId = String(formData.get('mediaId') ?? '').trim();
  const list = String(formData.get('list') ?? '') as ListName;
  const op = String(formData.get('op') ?? 'add');
  const back = String(formData.get('back') ?? '/lists');

  if (!mediaId || (list !== 'watched' && list !== 'planning')) return;

  const path = op === 'remove' ? `/remove/anime/${mediaId}` : `/add/anime/${mediaId}`;
  await apiFetch(path, { method: 'POST', body: { list }, token: session!.token });

  // Both list pages can be affected (an add/move touches the other list too).
  revalidatePath('/lists/watched');
  revalidatePath('/lists/planning');
  const backPath = back.split('?')[0];
  if (backPath && backPath !== '/lists/watched' && backPath !== '/lists/planning') {
    revalidatePath(backPath);
  }
}
