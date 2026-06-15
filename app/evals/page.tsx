import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const metadata = { title: 'Evals — Authority Ladder' };
export const dynamic = 'force-static';

function load(name: string): any | null {
  const p = path.join(process.cwd(), 'evals', 'results', name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function EvalsPage() {
  const retrieval = load('retrieval-scorecard.json');
  const assessment = load('assessment-scorecard.json');
  const probes = load('probe-scorecard.json');

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Evals</h1>
        <p className="mt-2 text-stone-600">
          The point of the repo. Every number here is read from a committed artifact in <code className="text-xs">evals/results/</code>, regenerated
          by the eval scripts, and gated in CI. Per-component scoring (retrieval / diagnosis / answer) so a failure is localised, not an opaque
          aggregate. Methodology and the labelling rubric: <a className="underline" href="https://github.com/nickbiird/authority-ladder/blob/main/evals/golden/RUBRIC.md">RUBRIC.md</a>.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Classification accuracy</h2>
        {assessment ? (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="py-1">Split</th><th>n</th><th>AI-or-not</th><th>Risk</th><th>Autonomy-ceiling</th><th>Answer (judged)</th>
              </tr>
            </thead>
            <tbody>
              {['core', 'contested'].map((k) => {
                const s = assessment.splits[k];
                if (!s?.n) return null;
                return (
                  <tr key={k} className="border-b border-stone-100">
                    <td className="py-1 font-medium">{k}</td><td>{s.n}</td>
                    <td>{pct(s.ai_or_not / s.n)}</td><td>{pct(s.risk / s.n)}</td>
                    <td>{pct(s.autonomy_ok / s.n)}</td><td>{pct(s.answer_pass / s.n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-stone-500">No assessment scorecard committed yet — run <code>npm run evals -- --record</code> with a key.</p>
        )}
        <p className="mt-2 text-xs text-stone-500">
          Core measures the system; contested measures agreement with one documented reading of arguable cases. The autonomy-ceiling column is the
          deterministic safety property (should read 100% — it is a CI gate, not a model behaviour). The answer column is model-judged and reported,
          not gated.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Retrieval scorecard</h2>
        {retrieval ? (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500"><th className="py-1">Config</th><th>Queries</th><th>Recall@5</th><th>MRR</th></tr>
            </thead>
            <tbody>
              {retrieval.configs.map((c: any) => (
                <tr key={c.config} className="border-b border-stone-100">
                  <td className="py-1 font-mono text-xs">{c.config}</td>
                  <td>{c.skipped ? '—' : c.queries}</td>
                  <td>{c.skipped ? <span className="text-stone-400">skipped</span> : pct(c.recall_at_5)}</td>
                  <td>{c.skipped ? '—' : c.mrr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-stone-500">No retrieval scorecard yet — run <code>npm run evals:retrieval</code>.</p>
        )}
        <p className="mt-2 text-xs text-stone-500">The default leg is the measured winner. <code>bm25-only</code> is deterministic and runs with no key (the CI gate); dense/hybrid populate once embeddings exist.</p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Security probes</h2>
        {probes ? (
          <ul className="mt-3 space-y-1 text-sm">
            {probes.results.map((r: any) => (
              <li key={r.name}><span className="mr-2">{r.passed ? '✅' : '❌'}</span><span className="font-mono text-xs">{r.name}</span> — <span className="text-stone-600">{r.detail}</span></li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-stone-500">No probe scorecard yet — run <code>npm run evals:probes</code>.</p>
        )}
        <p className="mt-2 text-xs text-stone-500">Lethal-trifecta containment is structural: the input gate rejects payloads pre-spend, and the writer node is provably reachable only from the human gate.</p>
      </section>
    </div>
  );
}
