export const metadata = { title: 'Methodology — Authority Ladder' };

export default function MethodologyPage() {
  return (
    <div className="prose prose-stone max-w-none space-y-6 text-sm leading-relaxed">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-2 text-stone-600">
          Authority Ladder productizes a consulting motion — <em>diagnose → architect → defend → price</em> — over a backlog of candidate AI use
          cases. It is triage: a cited, defended first-pass on each use case so a transformation budget goes where the value is, not a transformation
          mandate. It runs on a synthetic, clean-room pattern corpus, so it is fully open and carries no client data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">The pipeline, box by box</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-stone-700">
          <li><strong>Input gate</strong> (deterministic, no model): masks PII and rejects instruction-injection payloads before any spend.</li>
          <li><strong>Supervisor</strong>: routes each use case to the full pipeline, a diagnosis-only pass, or reject. Its prompt is the highest-leverage one in the system, so routing is in the golden set.</li>
          <li><strong>Diagnostician → Architect → Economist</strong>: three isolated specialists, each retrieving only its slice of the corpus (hybrid BM25 + dense, RRF), so no specialist&apos;s context is polluted. They only read — they never act — which is why running them is safe.</li>
          <li><strong>Critic</strong>: a binary judge that tries to refute the verdict from the evidence the specialists <em>actually retrieved</em>, not a fresh search. One revision, enforced by the graph.</li>
          <li><strong>Durable human gate</strong>: the run pauses on a checkpointed <code>interrupt()</code>. Nothing commits until a human approves; with Postgres the pause survives a restart.</li>
          <li><strong>Roadmap writer</strong>: the single irreversible action, in its own node <em>outside</em> the agent loop, reachable only after approval — never a tool a specialist can call.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-lg font-semibold">The three classifications, and how they&apos;re scored</h2>
        <p className="mt-2 text-stone-700">
          <strong>AI-or-not</strong> (none / classical ML / one LLM call / RAG / agent) — scored exact-match. Saying &quot;this is a SQL view, not AI&quot;
          ≈⅓ of the time is the credibility move, not a miss. <strong>Autonomy tier</strong> (suggest → draft → act-with-approval → act) — scored as a
          <em>ceiling</em>: the system passes if it never recommends a tier above what cost-of-error permits. Over-granting authority is the failure that
          matters; a deterministic clamp enforces it. <strong>Risk tier</strong> (EU AI Act) — one lightweight governance input, not a full compliance
          assessment.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Honesty card</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-700">
          <li>The corpus is synthetic, vendor-neutral enterprise-AI knowledge — no client data, fully open-sourceable.</li>
          <li>Contested-case labels are one documented reading of genuinely arguable cases; the rubric is published so you can disagree precisely.</li>
          <li>Costs are derived from real token traces, never estimated; an estimate the model produces is labelled as one.</li>
          <li>This is triage, not a transformation roadmap you should execute unread. The human gate exists for exactly that reason.</li>
        </ul>
      </section>
    </div>
  );
}
