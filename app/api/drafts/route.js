import { NextResponse } from 'next/server';
import { generateDrafts } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Call repeatedly until pending is 0.
export async function POST(req) {
  const { role } = await req.json();
  if (!['PM', 'SPM'].includes(role)) return NextResponse.json({ error: 'Pick PM or SPM.' }, { status: 400 });
  try {
    return NextResponse.json(await generateDrafts(role));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
