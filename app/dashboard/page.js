'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';

const ROLE_NAME = { PM: 'Product Manager', SPM: 'Senior Product Manager' };
const fmt = (n) => (n == null ? '–' : Number(n).toFixed(0));

export default function Dashboard() {
  const [all, setAll] = useState([]);
  const [n, setN] = useState(5);
  const [role, setRole] = useState('PM');
  const [selId, setSelId] = useState(null);
  const [err, setErr] = useState('');
  const [working, setWorking] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/candidates', { cache: 'no-store' });
    const out = await res.json();
    if (!res.ok) return setErr(out.error);
    setAll(out.candidates);
    setN(out.shortlistSize);
  }, []);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => all.filter((c) => c.applied_role === role), [all, role]);
  const scored = list.filter((c) => c.status === 'scored' || c.status === 'sent');
  const problems = list.filter((c) => c.status === 'error' || c.status === 'processing');
  const missing = scored.some((c, i) => c.status !== 'sent' && (!c.email_body || (i < n ? c.email_type !== 'invite' || !c.brief : c.email_type !== 'rejection')));
  const sel = list.find((c) => c.id === selId) || scored[0];
  const selRank = sel ? scored.findIndex((c) => c.id === sel.id) + 1 : 0;

  async function draftsLoop() {
    setWorking('Writing drafts…');
    for (let g = 0; g < 40; g++) {
      const res = await fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
      const out = await res.json();
      if (!res.ok) { setErr(out.error); break; }
      await load();
      if (out.pending === 0) break;
      setWorking(`Writing drafts, ${out.pending} left…`);
    }
    setWorking('');
  }

  async function rescoreAll() {
    if (!confirm(`Re-score every unsent ${role} candidate against the current rubric? Unsent drafts will be rewritten.`)) return;
    const targets = list.filter((c) => c.status !== 'sent');
    for (let i = 0; i < targets.length; i++) {
      setWorking(`Re-scoring ${i + 1} of ${targets.length}…`);
      await fetch('/api/rescore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: targets[i].id }) });
    }
    await load();
    await draftsLoop();
  }

  return (
    <>
      <div className="detail-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>Candidates</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            Ranked by rubric score for the role they applied to. The top {n} get an interview brief and an invite draft. Everyone else gets a rejection draft. Nothing is sent until you send it.
          </p>
        </div>
        <div className="row">
          {missing && <button onClick={draftsLoop} disabled={!!working}>Write missing drafts</button>}
          <button className="ghost" onClick={rescoreAll} disabled={!!working || !list.length}>Re-score all</button>
          <button className="ghost" onClick={load} disabled={!!working}>Refresh</button>
        </div>
      </div>

      <div className="tabs" role="group" aria-label="Role">
        {['PM', 'SPM'].map((r) => (
          <button key={r} aria-pressed={role === r} onClick={() => { setRole(r); setSelId(null); }}>
            {ROLE_NAME[r]} ({all.filter((c) => c.applied_role === r).length})
          </button>
        ))}
      </div>

      {err && <p className="err">{err}</p>}
      {working && <p className="muted" role="status">{working}</p>}

      {!list.length ? (
        <div className="panel"><p>No {ROLE_NAME[role]} candidates yet. <a href="/">Upload CVs</a> to start.</p></div>
      ) : (
        <div className="grid">
          <div>
            <ol className="ranked">
              {scored.map((c, i) => (
                <li key={c.id}>
                  {i === n && <div className="cutline">Interview line: candidates below get a rejection draft</div>}
                  <button aria-current={sel?.id === c.id} onClick={() => setSelId(c.id)}>
                    <span className="rank">{i + 1}</span>
                    <span className="who">
                      <strong>{c.personal?.name || c.file_name}</strong>
                      <span>
                        {c.status === 'sent' ? 'Sent' : c.email_type === 'invite' ? 'Invite drafted' : c.email_type === 'rejection' ? 'Rejection drafted' : 'Draft pending'}
                        {' '}· other role {fmt(role === 'PM' ? c.spm_total : c.pm_total)}
                      </span>
                    </span>
                    <span className="score">{fmt(c.applied_score)}</span>
                  </button>
                </li>
              ))}
            </ol>
            {problems.length > 0 && (
              <div className="panel" style={{ marginTop: 12 }}>
                <h2>Need attention</h2>
                {problems.map((c) => (
                  <div key={c.id} className="small" style={{ marginBottom: 8 }}>
                    <strong>{c.file_name}</strong> <span className="err">{c.error || 'Still processing'}</span>{' '}
                    <button className="ghost small" onClick={async () => { await fetch('/api/rescore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) }); load(); }}>Retry</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {sel && <Detail key={sel.id} c={sel} rank={selRank} inShortlist={selRank > 0 && selRank <= n} onChange={load} />}
        </div>
      )}
    </>
  );
}

function Detail({ c, rank, inShortlist, onChange }) {
  const [subject, setSubject] = useState(c.email_subject || '');
  const [body, setBody] = useState(c.email_body || '');
  const [personal, setPersonal] = useState(c.personal || {});
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const sent = c.status === 'sent';
  const rows = c.applied_role === 'PM' ? c.pm_scores : c.spm_scores;
  const otherRows = c.applied_role === 'PM' ? c.spm_scores : c.pm_scores;
  const other = c.applied_role === 'PM' ? 'SPM' : 'PM';

  async function save() {
    const res = await fetch('/api/candidate', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, email_subject: subject, email_body: body, personal }) });
    setMsg(res.ok ? 'Saved.' : 'Could not save.');
    onChange();
  }

  async function send() {
    if (!confirm(`Send this ${c.email_type} to ${personal.email || 'the candidate'}?`)) return;
    setSending(true); setMsg('');
    await fetch('/api/candidate', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, personal }) });
    const res = await fetch('/api/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, email_subject: subject, email_body: body }) });
    const out = await res.json();
    setSending(false);
    setMsg(res.ok ? `Sent to ${out.to}.` : out.error);
    onChange();
  }

  async function remove() {
    if (!confirm('Delete this candidate and their stored details?')) return;
    await fetch('/api/candidate', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) });
    onChange();
  }

  return (
    <section className="panel" aria-label="Candidate detail">
      <div className="detail-head">
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 2 }}>{personal.name || 'Name not found'}</h2>
          <div className="muted small">
            #{rank} for {c.applied_role} · {c.file_name}{' '}
            {sent ? <span className="tag sent">Sent {new Date(c.sent_at).toLocaleString()}</span>
              : inShortlist ? <span className="tag invite">Shortlist</span> : <span className="tag">Below the line</span>}
          </div>
          {c.summary && <p className="small" style={{ margin: '8px 0 0', maxWidth: '60ch' }}>{c.summary}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="big">{fmt(c.applied_score)}</div>
          <div className="muted small">{c.applied_role} score / 100</div>
          <div className="small">{other}: {fmt(c.applied_role === 'PM' ? c.spm_total : c.pm_total)}</div>
        </div>
      </div>

      {c.brief && (<><h3>Interview brief</h3><p className="brief">{c.brief}</p></>)}

      <h3>Why they ranked here ({c.applied_role} rubric)</h3>
      <ScoreTable rows={rows} />
      <details style={{ marginTop: 8 }}>
        <summary>Show {other} rubric scores</summary>
        <ScoreTable rows={otherRows} />
      </details>

      <h3>Draft email {c.email_type ? `(${c.email_type})` : ''}</h3>
      {!c.email_body && !sent ? (
        <p className="muted">No draft yet. Use “Write missing drafts” above.</p>
      ) : (
        <div className="stack">
          <input type="text" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sent} />
          <textarea aria-label="Email body" value={body} onChange={(e) => setBody(e.target.value)} disabled={sent} />
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary>Candidate details (private, never sent to AI)</summary>
        <div className="stack" style={{ marginTop: 8, maxWidth: 420 }}>
          <input type="text" aria-label="Name" placeholder="Name" value={personal.name || ''} onChange={(e) => setPersonal({ ...personal, name: e.target.value })} disabled={sent} />
          <input type="email" aria-label="Email" placeholder="Email" value={personal.email || ''} onChange={(e) => setPersonal({ ...personal, email: e.target.value })} disabled={sent} />
          <input type="text" aria-label="Phone" placeholder="Phone" value={personal.phone || ''} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} disabled={sent} />
        </div>
      </details>

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={send} disabled={sent || sending || !body}>{sent ? 'Sent' : sending ? 'Sending…' : `Confirm and send ${c.email_type || 'email'}`}</button>
        {!sent && <button className="ghost" onClick={save}>Save edits</button>}
        <button className="danger" onClick={remove}>Delete</button>
        {msg && <span className="small" role="status">{msg}</span>}
      </div>
    </section>
  );
}

function ScoreTable({ rows }) {
  if (!rows?.length) return <p className="muted small">No scores.</p>;
  return (
    <div className="scroll">
      <table className="crit">
        <thead><tr><th>Criterion</th><th>Weight</th><th>Score</th><th>Reason</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.criterion}>
              <td>{r.criterion}</td>
              <td className="n">{r.weight}%</td>
              <td className="n">{r.score}/10<span className="meter" aria-hidden="true"><i style={{ width: `${r.score * 10}%` }} /></span></td>
              <td>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
