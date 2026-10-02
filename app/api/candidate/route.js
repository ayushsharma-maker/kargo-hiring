import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const runtime = 'nodejs';

// Save edits to the draft or the stored personal details.
export async function PATCH(req) {
  const { id, email_subject, email_body, personal } = await req.json();
  const update = {};
  if (email_subject !== undefined) update.email_subject = email_subject;
  if (email_body !== undefined) update.email_body = email_body;
  if (personal) update.personal = personal;
  const { error } = await db().from('candidates').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const { id } = await req.json();
  const { error } = await db().from('candidates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
