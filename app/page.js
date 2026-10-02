'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function UploadPage() {
  const [role, setRole] = useState('PM');
  const [files, setFiles] = useState([]);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');

  const update = (i, patch) => setLog((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function run() {
    setBusy(true);
    const start = log.length;
    setLog((l) => [...l, ...files.map((f) => ({ name: f.name, role, state: 'Waiting' }))]);
    for (let i = 0; i < files.length; i++) {
      update(start + i, { state: 'Reading and scoring' });
      setPhase(`Scoring ${i + 1} of ${files.length}`);
      const fd = new FormData();
      fd.append('file', files[i]);
      fd.append('role', role);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || res.statusText);
        update(start + i, { state: `${out.name || 'Scored'}: ${out.score} for ${out.role}`, role: out.role, ok: true });
      } catch (e) {
        update(start + i, { state: e.message, error: true });
      }
    }
    let failed = false;
    for (const r of ['PM', 'SPM']) {
      for (let guard = 0; guard < 40; guard++) {
        setPhase(`Writing ${r} briefs and draft emails`);
        const res = await fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: r }) });
        const out = await res.json();
        if (!res.ok) { setPhase(`Drafts stopped: ${out.error}`); failed = true; break; }
        if (out.pending === 0) break;
        setPhase(`Writing ${r} drafts, ${out.pending} left`);
      }
      if (failed) break;
    }
    if (!failed) setPhase('Done. Every candidate has a draft.');
    setFiles([]);
    setBusy(false);
  }

  return (
    <>
      <h1>Upload CVs</h1>
      <p className="lede">
        Each CV is read on the server. Name, email and phone are separated and stored privately before anything is sent to AI.
        The rest is scored against both the PM and SPM rubrics.
      </p>
      <div className="panel stack" style={{ maxWidth: 640 }}>
        <div>
          <label htmlFor="role">Role they applied for</label>
          <div className="small muted">Files named pm_… or spm_… are assigned automatically.</div>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
            <option value="PM">Product Manager</option>
            <option value="SPM">Senior Product Manager</option>
          </select>
        </div>
        <div>
          <label htmlFor="files">CV files (PDF, DOCX or TXT, select several at once)</label>
          <input id="files" type="file" multiple accept=".pdf,.docx,.txt,.md" disabled={busy}
            onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </div>
        <div className="row">
          <button onClick={run} disabled={busy || !files.length}>
            {busy ? 'Working…' : `Upload and score ${files.length || ''} CV${files.length === 1 ? '' : 's'}`}
          </button>
          {phase && <span className="muted small" role="status">{phase}</span>}
        </div>
        {!busy && log.length > 0 && <p><Link href="/dashboard">Open the ranked candidates</Link></p>}
        {log.length > 0 && (
          <ul className="log">
            {log.map((l, i) => (
              <li key={i}>
                <span>{l.name} <span className="muted small">({l.role})</span></span>
                <span className={l.error ? 'err small' : 'muted small'}>{l.state}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
