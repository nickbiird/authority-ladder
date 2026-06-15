'use client';

import { useState } from 'react';

// --- shapes (mirror lib/types serialized over SSE) ---
type Tier = 'suggest' | 'draft' | 'act_with_approval' | 'act';
type Verdict = 'none' | 'classical_ml' | 'single_llm' | 'rag' | 'agent';
type Risk = 'prohibited' | 'high' | 'limited' | 'minimal';
type Seq = 'now' | 'next' | 'later' | 'do_not_build';

interface RoadmapItem {
  use_case_id: string;
  title: string;
  route: string;
  diagnosis: {
    ai_or_not: Verdict;
    ai_or_not_rationale: string;
    autonomy_tier: Tier;
    autonomy_rationale: string;
    cost_of_error: string;
    knowledge_location: string;
    risk_tier: Risk;
    risk_rationale: string;
  };
  architecture: {
    headline: string;
    components: { box: string; choice: string }[];
    failure_modes: string[];
    rejected_alternatives: { alternative: string; flip_condition: string }[];
    key_number: string;
  } | null;
  economics: { cost_per_task_eur?: number | null; cost_basis: string; human_baseline: string; payback: string; latency_budget: string };
  critique: { rounds: number; final: { verdict: string; critique: string } };
  sequencing: Seq;
  sequencing_rationale: string;
}

interface Roadmap {
  company_context: string;
  items: RoadmapItem[];
  corpus_version: string;
  total_cost_eur: number;
  approver_note: string;
}

const DEMO = `Overdue-invoice flagging :: Automatically flag any customer invoice more than 30 days past due so finance can chase it.
Churn prediction :: From two years of CRM history, predict which accounts will cancel next quarter, with the drivers.
Support-reply drafting :: Generate a first-draft reply to each customer email for an agent to review, edit, and send.
Policy Q&A :: Let employees ask questions about our internal HR policies and get an answer that cites the exact clause.
CV scoring :: Score and rank incoming job applicants against the role and surface the top candidates to recruiters.
Autonomous refund agent :: When a customer complains, investigate the order across systems and issue a refund automatically.`;

const VERDICT_LABEL: Record<Verdict, string> = {
  none: 'Not AI', classical_ml: 'Classical ML', single_llm: 'One LLM call', rag: 'RAG', agent: 'Agent',
};
const VERDICT_BG: Record<Verdict, string> = {
  none: 'bg-verdict-none', classical_ml: 'bg-verdict-ml', single_llm: 'bg-verdict-single', rag: 'bg-verdict-rag', agent: 'bg-verdict-agent',
};
const TIER_LABEL: Record<Tier, string> = {
  suggest: 'Suggest', draft: 'Draft', act_with_approval: 'Act w/ approval', act: 'Act',
};
const TIER_BG: Record<Tier, string> = {
  suggest: 'bg-ladder-suggest', draft: 'bg-ladder-draft', act_with_approval: 'bg-ladder-approve', act: 'bg-ladder-act',
};
const RISK_BG: Record<Risk, string> = {
  prohibited: 'bg-risk-prohibited', high: 'bg-risk-high', limited: 'bg-risk-limited', minimal: 'bg-risk-minimal',
};
const SEQ_LABEL: Record<Seq, string> = { now: 'NOW', next: 'NEXT', later: 'LATER', do_not_build: "DON'T BUILD" };
const SEQ_COLOR: Record<Seq, string> = {
  now: 'text-emerald-700 border-emerald-300 bg-emerald-50',
  next: 'text-sky-700 border-sky-300 bg-sky-50',
  later: 'text-amber-700 border-amber-300 bg-amber-50',
  do_not_build: 'text-stone-600 border-stone-300 bg-stone-100',
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium text-white ${className}`}>{children}</span>;
}

function parseBacklog(raw: string) {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((l, i) => {
    const [title, ...rest] = l.split('::');
    return { id: `uc-${i + 1}`, title: (title ?? `Use case ${i + 1}`).trim(), description: (rest.join('::') || title).trim() };
  });
}

export default function Home() {
  const [raw, setRaw] = useState(DEMO);
  const [company, setCompany] = useState('A 200-person mid-market services company, first serious AI push.');
  const [phase, setPhase] = useState<'idle' | 'running' | 'awaiting' | 'committing' | 'done'>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [pending, setPending] = useState<{ threadId: string; summary: Record<string, number> } | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [hitlMode, setHitlMode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function readStream(res: Response, onEvent: (e: any) => void) {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.split('\n').find((l) => l.startsWith('data: '));
        if (line) onEvent(JSON.parse(line.slice(6)));
      }
    }
  }

  function handleEvent(e: any) {
    if (e.type === 'guard_fail') { setError(typeof e.data === 'string' ? e.data : JSON.stringify(e.data)); setPhase('idle'); return; }
    if (e.type === 'error') { setError(String(e.data)); setPhase('idle'); return; }
    if (e.type === 'item') { setItems((prev) => [...prev, e.data as RoadmapItem]); setLog((l) => [...l, `triaged: ${(e.data as RoadmapItem).title} → ${(e.data as RoadmapItem).diagnosis.ai_or_not}`]); return; }
    if (e.type === 'node' && e.node === 'supervise' && e.data?.routes) { setLog((l) => [...l, `supervisor routed ${e.data.routes.length} use cases`]); return; }
    if (e.type === 'awaiting_approval') { setPending({ threadId: e.threadId, summary: e.data?.summary ?? {} }); setPhase('awaiting'); return; }
    if (e.type === 'roadmap') { setRoadmap(e.data as Roadmap); setItems((e.data as Roadmap).items); setPhase('done'); return; }
  }

  async function run() {
    setError(null); setItems([]); setRoadmap(null); setPending(null); setLog([]); setPhase('running');
    const use_cases = parseBacklog(raw);
    if (!use_cases.length) { setError('Add at least one use case.'); setPhase('idle'); return; }
    try {
      const res = await fetch('/api/assess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_context: company, use_cases }),
      });
      if (!res.ok) { setError((await res.json()).error ?? `HTTP ${res.status}`); setPhase('idle'); return; }
      await readStream(res, (e) => { if (e.type === 'meta') return; handleEvent(e); });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setPhase('idle'); }
  }

  async function decide(approved: boolean) {
    if (!pending) return;
    setPhase('committing');
    try {
      const res = await fetch('/api/resume', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: pending.threadId, approved, note }),
      });
      if (!res.ok) { setError((await res.json()).error ?? `HTTP ${res.status}`); setPhase('idle'); return; }
      await readStream(res, (e) => { if (e.type === 'meta') return; handleEvent(e); });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setPhase('idle'); }
  }

  const busy = phase === 'running' || phase === 'committing';

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Where should AI act?</h1>
        <p className="mt-2 text-stone-600">
          Drop a backlog of candidate AI use cases. Get back a defended, priced, prioritized roadmap — per use case: an{' '}
          <strong>AI-or-not</strong> verdict (≈⅓ are not AI), a place on the <strong>autonomy ladder</strong> sized to cost-of-error, a{' '}
          <strong>defended architecture</strong>, an <strong>EU-AI-Act risk tier</strong>, and a <strong>price</strong>. A critic refutes each verdict;
          nothing commits until you approve it at a durable gate.
        </p>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <label className="block text-sm font-medium text-stone-700">Company context</label>
        <input className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm" value={company} onChange={(e) => setCompany(e.target.value)} disabled={busy} />
        <label className="mt-4 block text-sm font-medium text-stone-700">Backlog — one use case per line, <code className="text-xs">Title :: description</code></label>
        <textarea className="mt-1 h-44 w-full rounded border border-stone-300 px-3 py-2 font-mono text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} disabled={busy} />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={run} disabled={busy} className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">
            {phase === 'running' ? 'Triaging…' : 'Run triage'}
          </button>
          {busy && <span className="text-sm text-stone-500">streaming…</span>}
        </div>
      </section>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 whitespace-pre-wrap">{error}</div>}

      {(items.length > 0 || phase !== 'idle') && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Triaged use cases {roadmap ? '(committed roadmap)' : items.length ? `(${items.length} so far)` : ''}
          </h2>
          {items.map((it) => (
            <ItemCard key={it.use_case_id} it={it} />
          ))}
          {items.length === 0 && busy && <p className="text-sm text-stone-500">Working through the backlog…</p>}
        </section>
      )}

      {phase === 'awaiting' && pending && (
        <section className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Durable approval gate</h2>
          <p className="mt-1 text-sm text-amber-800">
            The run has <strong>paused on a checkpointed interrupt</strong> before anything commits. Nothing is published until you decide — and with
            a Postgres checkpointer configured, you could close this tab and approve tomorrow.{' '}
            <span className="font-mono text-xs">{hitlMode || 'mode reported per run'}</span>
          </p>
          <p className="mt-2 text-sm text-amber-800">
            Roadmap summary — now: {pending.summary.now ?? 0}, next: {pending.summary.next ?? 0}, later: {pending.summary.later ?? 0}, don&apos;t build: {pending.summary.do_not_build ?? 0}
          </p>
          <input className="mt-3 w-full rounded border border-amber-300 px-3 py-2 text-sm" placeholder="Optional approver note…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 flex gap-3">
            <button onClick={() => decide(true)} className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">Approve &amp; commit roadmap</button>
            <button onClick={() => decide(false)} className="rounded border border-stone-400 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">Reject</button>
          </div>
        </section>
      )}

      {roadmap && (
        <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">Roadmap committed</h2>
          <p className="mt-1 text-stone-600">{roadmap.approver_note}</p>
          <p className="mt-2 text-stone-500">
            {roadmap.items.length} use cases · corpus <span className="font-mono text-xs">{roadmap.corpus_version}</span> · metered cost €{roadmap.total_cost_eur.toFixed(4)} for the whole backlog
          </p>
        </section>
      )}
    </div>
  );
}

function ItemCard({ it }: { it: RoadmapItem }) {
  const d = it.diagnosis;
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs font-bold ${SEQ_COLOR[it.sequencing]}`}>{SEQ_LABEL[it.sequencing]}</span>
        <h3 className="font-medium">{it.title}</h3>
        <span className="ml-auto flex flex-wrap gap-1">
          <Pill className={VERDICT_BG[d.ai_or_not]}>{VERDICT_LABEL[d.ai_or_not]}</Pill>
          <Pill className={TIER_BG[d.autonomy_tier]}>{TIER_LABEL[d.autonomy_tier]}</Pill>
          <Pill className={RISK_BG[d.risk_tier]}>{d.risk_tier} risk</Pill>
        </span>
      </div>
      <p className="mt-2 text-sm text-stone-600"><strong>AI-or-not:</strong> {d.ai_or_not_rationale}</p>
      <p className="mt-1 text-sm text-stone-600"><strong>Autonomy ({TIER_LABEL[d.autonomy_tier]}, cost-of-error {d.cost_of_error}):</strong> {d.autonomy_rationale}</p>
      {it.architecture && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-stone-700">Architecture — {it.architecture.headline}</summary>
          <div className="mt-2 space-y-2 text-xs text-stone-600">
            <div><strong>Components:</strong> {it.architecture.components.map((c) => `${c.box}=${c.choice}`).join(' · ')}</div>
            <div><strong>Failure modes:</strong>
              <ul className="ml-4 list-disc">{it.architecture.failure_modes.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
            <div><strong>Rejected alternatives:</strong>
              <ul className="ml-4 list-disc">{it.architecture.rejected_alternatives.map((r, i) => <li key={i}>{r.alternative} — <em>flip if:</em> {r.flip_condition}</li>)}</ul>
            </div>
            <div><strong>Key number:</strong> {it.architecture.key_number}</div>
          </div>
        </details>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-medium text-stone-700">
          Economics &amp; critic {it.critique.final.verdict === 'pass' ? '✓ survived review' : `(revised ×${it.critique.rounds - 1})`}
        </summary>
        <div className="mt-2 space-y-1 text-xs text-stone-600">
          <div><strong>Cost/task:</strong> {it.economics.cost_per_task_eur != null ? `~€${it.economics.cost_per_task_eur}` : '—'} ({it.economics.cost_basis})</div>
          <div><strong>vs baseline:</strong> {it.economics.human_baseline}</div>
          <div><strong>Payback:</strong> {it.economics.payback}</div>
          <div><strong>Critic:</strong> {it.critique.final.critique}</div>
        </div>
      </details>
      <p className="mt-2 text-xs text-stone-500"><strong>Sequencing:</strong> {it.sequencing_rationale}</p>
    </div>
  );
}
