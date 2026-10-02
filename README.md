# Kargo hiring dashboard (MESA Case 2) 

Founder uploads CVs and picks the role. The app separates personal details on the server, scores every candidate against both the PM and SPM rubrics with Gemini Flash, ranks them, writes a 3-sentence interview brief for the top 5 per role, drafts an invite or warm rejection for everyone, and sends nothing until the founder clicks **Confirm and send** (via Resend).

Stack: Next.js on Vercel, Supabase (Postgres), Gemini Flash, Resend.

## Pages
- `/` upload CVs (PDF, DOCX, TXT; many at once) and pick PM or SPM
- `/dashboard` ranked list per role with an interview line, score breakdown, brief, editable draft, send button
- `/rubric` load `rubric.txt`; this fills the `rubric_criteria` table

## Setup (about 20 minutes)

1. **Supabase.** Create a project. SQL Editor → paste `supabase/schema.sql` → Run. From Project Settings → API copy the Project URL and the `service_role` key.
2. **Gemini.** Get a key at aistudio.google.com/apikey.
3. **Local run.** `cp .env.example .env.local`, fill in the keys, then `npm install` and `npm run dev`. Open http://localhost:3000.
4. **Rubric.** Already loaded: `schema.sql` inserts the rubric from `rubric.txt`. Check the `/rubric` page shows 4 criteria per role totalling 100%.
5. **GitHub.** Check `.env.local` is listed in `.gitignore` (it is). Then:
   ```
   git init && git add . && git commit -m "Kargo hiring dashboard"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/kargo-hiring.git
   git push -u origin main
   ```
   Make the repo **public** (Settings → General → Danger zone → Change visibility).
6. **Vercel.** Add New → Project → import the repo. Under Environment Variables add everything from `.env.local` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `RESEND_API_KEY`, `RESEND_FROM`, `SHORTLIST_SIZE`). Deploy.
7. **Resend.** Create an API key at resend.com, add it as `RESEND_API_KEY` in Vercel, redeploy. With the default sender `onboarding@resend.dev`, Resend only delivers to the email address on your Resend account. If the MESA test address is different, either verify a domain in Resend or set `TEST_RECIPIENT_OVERRIDE` to your own address for the demo.

## Test it (checkpoint B-1)
Upload 3 CVs first: one strong PM, one weak SPM, one ambiguous. In Supabase → Table editor → `candidates`, open a row: `personal` holds name, email and phone; `cv_content` shows `[CANDIDATE]`, `[EMAIL]`, `[PHONE]` instead. Then upload the rest. If a name was detected wrongly, fix it under "Candidate details" before sending.

If Gemini rate limits on the free tier, the app retries automatically. If some CVs still fail, use **Retry** in the "Need attention" box on the dashboard.

## Privacy design
- Personal details (name, email, phone, LinkedIn) are pulled out with plain code on the server and stored in a separate `personal` column. Every AI call (scoring, brief, email) receives only the redacted `cv_content`.
- The AI writes emails with a literal `[NAME]` placeholder; the real first name is substituted on the server afterwards.
- Both tables have Row Level Security on with no public policies; only the server (service-role key) can read them.
- Optional: set `DASHBOARD_PASSWORD` to put the whole app behind a password.

**Data privacy questions from the brief.** On the Gemini free tier (AI Studio without billing), Google may use the prompts and responses to improve its products and humans may review them. With billing enabled on the paid API, Google states it does not use that data to train its models. Data is kept only for a limited period for abuse monitoring. For DPDP, the extraction step is what matters: it applies data minimisation and purpose limitation. Identifiers never leave our system to a third-party processor, the AI only processes what is necessary to assess the role, and personal data sits in one controllable place. That makes it straightforward to restrict access, answer access requests and delete a candidate on request (the Delete button removes the row).
