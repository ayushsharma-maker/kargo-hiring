import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { fileToText, separatePersonalDetails } from '@/lib/extract';
import { scoreCandidate } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  const form = await req.formData();
  const file = form.get('file');
  let role = form.get('role');
  // A file named pm_... or spm_... always goes to that role, whatever the dropdown says.
  const prefix = (file?.name || '').toLowerCase().match(/^(spm|pm)[_\-\s]/);
  if (prefix) role = prefix[1].toUpperCase();
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file attached.' }, { status: 400 });
  if (!['PM', 'SPM'].includes(role)) return NextResponse.json({ error: 'Pick PM or SPM.' }, { status: 400 });

  let id;
  try {
    const text = await fileToText(await file.arrayBuffer(), file.name);
    if (!text || text.trim().length < 80) throw new Error('Could not read text from this file. If it is a scanned image, upload a text-based PDF or DOCX.');
    const { personal, content } = separatePersonalDetails(text, file.name);

    const { data, error } = await db()
      .from('candidates')
      .insert({ applied_role: role, file_name: file.name, personal, cv_content: content, status: 'processing' })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    id = data.id;

    const scores = await scoreCandidate(content, role);
    const { error: e2 } = await db().from('candidates').update({ ...scores, status: 'scored', error: null }).eq('id', id);
    if (e2) throw new Error(e2.message);

    return NextResponse.json({ id, name: personal.name, role, score: scores.applied_score });
  } catch (err) {
    if (id) await db().from('candidates').update({ status: 'error', error: err.message }).eq('id', id);
    return NextResponse.json({ error: err.message, id }, { status: 500 });
  }
}
