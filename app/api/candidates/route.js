import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await db()
    .from('candidates')
    .select('id, applied_role, file_name, personal, summary, pm_scores, spm_scores, pm_total, spm_total, applied_score, brief, email_type, email_subject, email_body, status, error, sent_at, created_at')
    .order('applied_score', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ candidates: data, shortlistSize: Number(process.env.SHORTLIST_SIZE || 5) });
}
