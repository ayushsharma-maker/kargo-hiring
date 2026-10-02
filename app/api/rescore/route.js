import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { scoreCandidate } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Re-score one candidate (after the rubric changes, or to retry an error). Unsent drafts are cleared.
export async function POST(req) {
  const { id } = await req.json();
  const { data: c, error } = await db().from('candidates').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (c.status === 'sent') return NextResponse.json({ skipped: true });
  try {
    const scores = await scoreCandidate(c.cv_content, c.applied_role);
    await db().from('candidates').update({
      ...scores, status: 'scored', error: null,
      brief: null, email_type: null, email_subject: null, email_body: null,
    }).eq('id', id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    await db().from('candidates').update({ status: 'error', error: err.message }).eq('id', id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
