import { createClient } from '@supabase/supabase-js';

let client;
export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export async function getRubric() {
  const { data, error } = await db()
    .from('rubric_criteria')
    .select('role, position, name, description, weight')
    .order('position');
  if (error) throw new Error(error.message);
  const rubric = { PM: [], SPM: [] };
  for (const c of data) rubric[c.role]?.push(c);
  if (!rubric.PM.length || !rubric.SPM.length) {
    throw new Error('Rubric is empty. Load rubric.txt on the Rubric page first.');
  }
  return rubric;
}
