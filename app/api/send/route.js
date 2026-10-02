import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req) {
  const { id, email_subject, email_body } = await req.json();
  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ error: 'RESEND_API_KEY is not set. Add it in Vercel settings and redeploy.' }, { status: 500 });

  const { data: c, error } = await db().from('candidates').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (c.sent_at) return NextResponse.json({ error: 'This email was already sent.' }, { status: 409 });

  const subject = email_subject ?? c.email_subject;
  const body = email_body ?? c.email_body;
  if (!subject || !body) return NextResponse.json({ error: 'There is no draft to send yet.' }, { status: 400 });
  if (/\[NAME\]/.test(body)) return NextResponse.json({ error: 'The draft still contains [NAME]. Add the candidate name and try again.' }, { status: 400 });

  const to = process.env.TEST_RECIPIENT_OVERRIDE || c.personal?.email;
  if (!to) return NextResponse.json({ error: 'No email address was found in this CV. Add one in the candidate details.' }, { status: 400 });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Kargo Hiring <onboarding@resend.dev>',
      to: [to],
      subject,
      text: body,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: `Resend: ${out.message || res.status}` }, { status: 502 });

  const sent_at = new Date().toISOString();
  await db().from('candidates').update({ email_subject: subject, email_body: body, status: 'sent', sent_at }).eq('id', id);
  return NextResponse.json({ ok: true, to, sent_at, resend_id: out.id });
}
