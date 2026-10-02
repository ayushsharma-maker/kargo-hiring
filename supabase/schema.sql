-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create extension if not exists pgcrypto;

-- One row per rubric criterion per role. Populated from rubric.txt via the /rubric page.
create table if not exists rubric_criteria (
  id          bigint generated always as identity primary key,
  role        text    not null check (role in ('PM','SPM')),
  position    int     not null,
  name        text    not null,
  description text    not null,
  weight      numeric not null,
  source      text,               -- which past hire(s) the criterion came from
  created_at  timestamptz default now()
);

create table if not exists candidates (
  id            uuid primary key default gen_random_uuid(),
  applied_role  text not null check (applied_role in ('PM','SPM')),
  file_name     text,
  personal      jsonb not null default '{}'::jsonb,  -- {name, email, phone, linkedin}: NEVER sent to AI
  cv_content    text,                                -- CV text with personal details redacted: the only thing AI sees
  summary       text,
  pm_scores     jsonb,   -- [{criterion, score, weight, reason}]
  spm_scores    jsonb,
  pm_total      numeric, -- 0-100 weighted
  spm_total     numeric,
  applied_score numeric, -- total for the role they applied to (used for ranking)
  brief         text,    -- 3-sentence interview brief (shortlist only)
  email_type    text check (email_type in ('invite','rejection')),
  email_subject text,
  email_body    text,    -- final text with real name substituted
  status        text not null default 'processing', -- processing | scored | sent | error
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz default now()
);

create index if not exists candidates_role_score on candidates (applied_role, applied_score desc);

-- Lock both tables down. The app talks to Supabase only from the server with the
-- service-role key, so the public anon key can read nothing.
alter table rubric_criteria enable row level security;
alter table candidates      enable row level security;

-- Rubric from rubric.txt (one row per criterion per role). Re-running replaces it.
delete from rubric_criteria;
insert into rubric_criteria (role, position, name, description, weight, source) values
  ('PM', 1, 'Ground-level operations exposure', 'Strong: has personally done operational work in freight, logistics, supply chain or a comparable field operation (handled shipments, documents, carriers, dispatch, warehouses, field teams), or spent real time physically inside a customer''s operation, not only interviewing users remotely. The CV names concrete operational tasks and volumes. Weak: product, marketing or engineering experience built entirely from a desk, where users appear only as interviews, tickets or dashboards.', 30, 'Lavanya Iyer (3 years of carrier ops at Mahindra Logistics), Rohan Desai (CHA ops at JNPT), Sunita Krishnamurthy and Meghna Tiwari (freight documentation), Aditya Shetty (port services at JNPT). Absent in Vikram Nair, Preetham Rao and Rahul Bose.'),
  ('PM', 2, 'Unasked-for fixes that others adopted', 'Strong: at least one example where the person noticed a broken or missing process nobody assigned them, built a scrappy fix (a spreadsheet, prototype, checklist, triage process) on their own initiative, and other people then adopted it, with the adoption stated ("used by 12 people within two weeks", "became the team standard"). Weak: only assigned projects, or outputs like features shipped and revenue with no sign the person saw the problem first and the fix spread without a mandate.', 30, 'Rohan Desai (Excel tracker adopted by a 12-person team in 2 weeks; weekend BoL prototype used by 30 colleagues), Sunita Krishnamurthy (redesigned intake over a weekend, kept permanently), Lavanya Iyer (dashboard adopted by 2 other teams; same-day triage process), Meghna Tiwari (onboarding checklist became the team standard).'),
  ('PM', 3, 'Kills and post-mortems on the record', 'Strong: the CV openly describes something that failed or was stopped (a feature killed, a deal lost, an outage, a bug) and what the person did about it: wrote the post-mortem, shared the root cause, changed a practice. Weak: a CV made only of wins and percentage improvements, with no failure, kill or lesson anywhere.', 20, 'Lavanya Iyer (killed 2 features on usage data; wrote the outage post-mortem), Aditya Shetty (post-mortem on a lost freight forwarder deal became standard practice), Meghna Tiwari (owned an undocumented product limitation through a 6-week fix). Vikram Nair''s and Rahul Bose''s CVs contain only wins.'),
  ('PM', 4, 'Owned it without a layer above', 'Strong: was the sole or final owner of a product area, account book or process, making calls without a senior PM or manager making them, stated plainly ("sole PM", "no product layer", "no escalation to management"). Weak: supported senior PMs, was one member of a large team, or the CV describes contribution rather than ownership.', 20, 'Lavanya Iyer (sole PM for 3 product areas), Rohan Desai (translated field needs into specs with no product layer), Aditya Shetty (ran the full sales cycle alone), Meghna Tiwari (no escalation in 14 months), Sunita Krishnamurthy (independent consultant). Weak in Vikram Nair (supported senior PMs) and Preetham Rao (one of 12 engineers).'),
  ('SPM', 1, 'Ground-level operations exposure', 'Strong: has done hands-on operational work in freight, logistics, supply chain or another field operation and has carried that understanding into later product or technical decisions, with a named example where operational knowledge changed what got built. Weak: no operational work at all, or operations mentioned only as a customer segment they sold to or interviewed.', 25, 'Rohan Desai (freight ops before engineering; works with forwarder ops teams during rollouts), Lavanya Iyer (carrier ops; discovery session uncovered a slot-booking workflow mismatch and led to a pivot). Absent in Vikram Nair, Preetham Rao and Rahul Bose.'),
  ('SPM', 2, 'Unasked-for fixes that others adopted', 'Strong: more than one self-initiated fix or practice that spread beyond the person''s own team or was made permanent, such as a process other teams copied or a prototype that became a core feature. Weak: improvements only inside their own remit or on assignment, or a single small example.', 20, 'Rohan Desai (weekend BoL prototype became a core platform feature), Lavanya Iyer (dashboard adopted by 2 other regional teams), Sunita Krishnamurthy (SOPs adopted in full by a client firm within 60 days).'),
  ('SPM', 3, 'Kills and post-mortems on the record', 'Strong: describes at least one failure or stopped effort with real stakes (a lost deal, an outage, a failed migration, a killed product line) and shows the lesson changed how a wider group works afterwards: a new standard, a review process, a rule others now follow. Weak: no failures mentioned, or failures mentioned with no change that followed.', 20, 'Aditya Shetty (lost-deal post-mortem became standard qualification practice), Lavanya Iyer (outage post-mortem with follow-ups owned to closure; killed 2 features).'),
  ('SPM', 4, 'Owned it without a layer above', 'Strong: for a sustained period (a year or more) was the most senior person making calls on a product area, platform, client book or business, with no senior PM or manager above deciding for them, AND made decisions with consequences beyond the next sprint (migrations, vendor changes, what to stop building) that held. Weak: senior title but decisions made by a head of product or above, or ownership only of features inside someone else''s roadmap.', 35, 'Rohan Desai (most senior engineer in the room; led a legacy vendor migration under pressure with no data loss), Sunita Krishnamurthy (independent consultant owning client migrations end to end), Lavanya Iyer (sole PM; engineering lead said she makes calls the team trusts immediately). Note: Rahul Bose also had no layer above but was rated Meets, so this criterion only scores high when the decisions themselves are concrete and held.');
