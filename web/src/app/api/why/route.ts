import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api';

interface WhyBody {
  query?: string;
  items?: { media_id: string; title?: string | null; description?: string }[];
}

export async function POST(req: Request) {
  let body: WhyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.query || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ whys: [] });
  }

  const res = await apiFetch<{ whys: { media_id: string; why: string }[] }>('/search/why', {
    method: 'POST',
    body: {
      query: body.query,
      items: body.items.slice(0, 50),
    },
  });

  if (!res.ok || !res.data) {
    return NextResponse.json({ whys: [] }, { status: 200 });
  }
  return NextResponse.json(res.data);
}
