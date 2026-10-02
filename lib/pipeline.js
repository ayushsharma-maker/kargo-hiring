import { db, getRubric } from './supabase';
import { geminiJSON } from './gemini';

export const ROLES = { PM: 'Product Manager', SPM: 'Senior Product Manager' };
export const shortlistSize = () => Number(process.env.SHORTLIST_SIZE || 5);

const rubricText = (criteria) =>
  criteria.map((c, i) => `${i + 1}. ${c.name} (weight ${c.weight}%)\n   Strong candidate: ${c.description}`).join('\n');

// Step 2: score against BOTH rubrics. Only redacted CV content is sent.
export async function scoreCandidate(cvContent, appliedRole) {
  const rubric = await getRubric();
  const prompt = `You are scoring a job application for Kargo, a Series A logistics SaaS company in Mumbai.
Personal details have been removed and replaced with [CANDIDATE], [EMAIL], [PHONE]. Do not guess identity, gender, age or background.
Score ONLY on evidence written in the CV. If there is no evidence for a criterion, score it low and say so.

The candidate applied for: ${ROLES[appliedRole]}. Score them against BOTH rubrics anyway.

PRODUCT MANAGER RUBRIC
${rubricText(rubric.PM)}

SENIOR PRODUCT MANAGER RUBRIC
${rubricText(rubric.SPM)}

Scoring scale per criterion, 0 to 10:
0-2 no evidence, 3-4 weak or implied, 5-6 some concrete evidence, 7-8 clear repeated evidence, 9-10 exceptional and specific.

CV CONTENT
"""
${cvContent}
"""

Return JSON exactly in this shape, keeping criteria in the same order as the rubrics:
{
  "summary": "one neutral line on their background, no names",
  "PM":  [{"criterion": "<name>", "score": <0-10>, "reason": "<one line citing CV evidence>"}],
  "SPM": [{"criterion": "<name>", "score": <0-10>, "reason": "<one line citing CV evidence>"}]
}`;

  const out = await geminiJSON(prompt, { temperature: 0.1 });
  const build = (role) =>
    rubric[role].map((c, i) => {
      const hit = (out[role] || []).find((s) => s.criterion?.toLowerCase().trim() === c.name.toLowerCase().trim()) || out[role]?.[i] || {};
      const score = Math.max(0, Math.min(10, Number(hit.score) || 0));
      return { criterion: c.name, weight: Number(c.weight), score, reason: hit.reason || 'No reason returned.' };
    });
  const total = (rows) => {
    const w = rows.reduce((a, r) => a + r.weight, 0) || 100;
    return Math.round((rows.reduce((a, r) => a + (r.score / 10) * r.weight, 0) / w) * 1000) / 10;
  };
  const pm = build('PM');
  const spm = build('SPM');
  const pmTotal = total(pm);
  const spmTotal = total(spm);
  return {
    summary: out.summary || '',
    pm_scores: pm,
    spm_scores: spm,
    pm_total: pmTotal,
    spm_total: spmTotal,
    applied_score: appliedRole === 'PM' ? pmTotal : spmTotal,
  };
}

const scoreLines = (rows) => rows.map((r) => `- ${r.criterion}: ${r.score}/10 (${r.reason})`).join('\n');

// Step 3: three-sentence interview brief, shortlist only.
async function writeBrief(c, rank) {
  const rows = c.applied_role === 'PM' ? c.pm_scores : c.spm_scores;
  const out = await geminiJSON(`Write an interview brief for Arjun, founder of Kargo, about a ${ROLES[c.applied_role]} candidate ranked #${rank} of applicants.
Exactly three sentences, plain text, no names:
1) who they are, in concrete terms from the CV;
2) why the system ranked them here, citing their strongest criteria;
3) the one thing Arjun should probe in the interview, based on their weakest criterion or a gap.

Scores:
${scoreLines(rows)}

CV content:
"""
${c.cv_content.slice(0, 8000)}
"""

Return JSON: {"brief": "<three sentences>"}`);
  return out.brief || '';
}

// Step 4: personalised email. AI writes [NAME]; real name is substituted here, never sent to AI.
async function writeEmail(c, type) {
  const rows = c.applied_role === 'PM' ? c.pm_scores : c.spm_scores;
  const instructions =
    type === 'invite'
      ? `An interview invitation. Mention one or two specific things from their CV that stood out. Invite them to a 45-minute conversation with Arjun and ask them to reply with two or three times that work for them next week. Confident and warm, no hype.`
      : `A warm, respectful rejection. Thank them, acknowledge one genuine and specific strength from their CV, say clearly that Kargo is not moving forward for this role right now. Do not give scores, do not promise future roles, do not apologise for the delay at length. Brief and human.`;
  const out = await geminiJSON(`Write an email from Arjun Mehta, founder of Kargo (Series A logistics SaaS, Mumbai), to someone who applied for ${ROLES[c.applied_role]}.
${instructions}
Open with "Hi [NAME]," exactly, using the literal placeholder [NAME]. Never invent or guess a name.
Under 140 words. Plain text, no markdown. Sign off as:
Arjun Mehta
Founder, Kargo

Their CV content:
"""
${c.cv_content.slice(0, 6000)}
"""

Their evaluation:
${scoreLines(rows)}

Return JSON: {"subject": "<subject line>", "body": "<email body>"}`, { temperature: 0.5 });

  const first = (c.personal?.name || '').split(/\s+/)[0] || 'there';
  const sub = (s) => (s || '').replace(/\[NAME\]/g, first).replace(/\[CANDIDATE\]/g, first);
  return { email_subject: sub(out.subject), email_body: sub(out.body) };
}

// Ranks a role and fills in missing or out-of-date drafts. Processes a few at a time
// so each request stays inside serverless time limits. Returns how many are still pending.
export async function generateDrafts(role, maxWork = 4) {
  const { data, error } = await db()
    .from('candidates')
    .select('*')
    .eq('applied_role', role)
    .in('status', ['scored', 'sent'])
    .order('applied_score', { ascending: false });
  if (error) throw new Error(error.message);

  const n = shortlistSize();
  const jobs = [];
  data.forEach((c, i) => {
    if (c.status === 'sent') return;
    const type = i < n ? 'invite' : 'rejection';
    const needBrief = type === 'invite' && !c.brief;
    const needEmail = c.email_type !== type || !c.email_body;
    if (needBrief || needEmail) jobs.push({ c, type, rank: i + 1, needBrief, needEmail });
  });

  for (const job of jobs.slice(0, maxWork)) {
    const update = {};
    if (job.needBrief) update.brief = await writeBrief(job.c, job.rank);
    if (job.needEmail) Object.assign(update, await writeEmail(job.c, job.type), { email_type: job.type });
    const { error: e } = await db().from('candidates').update(update).eq('id', job.c.id);
    if (e) throw new Error(e.message);
  }
  return { pending: Math.max(0, jobs.length - maxWork) };
}
