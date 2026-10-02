import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await db().from('rubric_criteria').select('*').order('role').order('position');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ criteria: data });
}

// Takes the raw text of rubric.txt, structures it, and replaces the rubric_criteria rows.
export async function POST(req) {
  const { text } = await req.json();
  if (!text || text.trim().length < 50) return NextResponse.json({ error: 'Paste the full contents of rubric.txt.' }, { status: 400 });
  try {
    const out = await geminiJSON(`Convert this hiring rubric into JSON. Copy names and descriptions faithfully; do not rewrite, add or drop criteria.
Weights are percentages as numbers. If the text names the past hire(s) a criterion came from, put that in "source", otherwise "".

RUBRIC TEXT
"""
${text}
"""

Return JSON: {"PM": [{"name": "", "description": "", "weight": 0, "source": ""}], "SPM": [ same ]}`, { temperature: 0 });

    const rows = [];
    const warnings = [];
    for (const role of ['PM', 'SPM']) {
      const list = out[role] || [];
      if (list.length < 4 || list.length > 6) warnings.push(`${role} has ${list.length} criteria (expected 4 to 6).`);
      const sum = list.reduce((a, c) => a + Number(c.weight || 0), 0);
      if (Math.abs(sum - 100) > 0.5) warnings.push(`${role} weights add up to ${sum}%, not 100%.`);
      list.forEach((c, i) =>
        rows.push({ role, position: i + 1, name: c.name, description: c.description, weight: Number(c.weight) || 0, source: c.source || null })
      );
    }
    if (!rows.length) throw new Error('No criteria found in that text.');

    const sb = db();
    const { error: delErr } = await sb.from('rubric_criteria').delete().gte('id', 0);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await sb.from('rubric_criteria').insert(rows);
    if (insErr) throw new Error(insErr.message);
    return NextResponse.json({ saved: rows.length, warnings });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
