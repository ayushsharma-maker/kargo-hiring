'use client';
import { useEffect, useState } from 'react';

export default function RubricPage() {
  const [criteria, setCriteria] = useState([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch('/api/rubric', { cache: 'no-store' });
    const out = await res.json();
    if (res.ok) setCriteria(out.criteria); else setMsg(out.error);
  };
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg('Reading rubric…');
    const res = await fetch('/api/rubric', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const out = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Saved ${out.saved} criteria.${out.warnings.length ? ' Check: ' + out.warnings.join(' ') : ''}` : out.error);
    load();
  }

  const byRole = (r) => criteria.filter((c) => c.role === r);
  const sum = (r) => byRole(r).reduce((a, c) => a + Number(c.weight), 0);

  return (
    <>
      <h1>Rubric</h1>
      <p className="lede">Every candidate is scored against both of these. Criteria come from patterns in Kargo’s best past hires, not from the job descriptions.</p>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {['PM', 'SPM'].map((r) => (
          <div className="panel" key={r}>
            <h2>{r === 'PM' ? 'Product Manager' : 'Senior Product Manager'} <span className="muted small">weights total {sum(r)}%</span></h2>
            {!byRole(r).length && <p className="muted">Not loaded yet.</p>}
            {byRole(r).map((c) => (
              <div key={c.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
                <strong>{c.name}</strong> <span className="muted">{c.weight}%</span>
                <div className="small">{c.description}</div>
                {c.source && <div className="small muted">From: {c.source}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="panel stack" style={{ marginTop: 20 }}>
        <h2>Load rubric.txt</h2>
        <p className="small muted" style={{ margin: 0 }}>This replaces the current rubric. If candidates are already scored, use “Re-score all” on the Candidates page afterwards.</p>
        <input type="file" accept=".txt,.md" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Or paste the contents of rubric.txt here" />
        <div className="row">
          <button onClick={save} disabled={busy || !text.trim()}>Save rubric</button>
          {msg && <span className="small" role="status">{msg}</span>}
        </div>
      </div>
    </>
  );
}
