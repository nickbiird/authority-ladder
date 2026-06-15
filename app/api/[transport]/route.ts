/**
 * MCP server over the same engine the UI uses — streamable HTTP, stateless per
 * call (the serverless-compatible transport; stdio is for local procs). This is
 * the "expose the core capability over MCP + consume it" half of the build: any
 * MCP client (Claude, Cursor, another agent) can call these tools.
 *
 * The documented asymmetry: diagnose_use_case returns an UNGATED draft. A
 * synchronous MCP tool call cannot park on a human approval and resume later, so
 * the durable gate — the part that makes the autonomy ladder real — only exists
 * in the web flow, where interrupt() + the checkpointer make the pause durable.
 * The tool says so in its own description and stamps every response
 * ungated_draft: true rather than pretending parity. (This is the autonomy ladder
 * eating its own dogfood: an MCP tool call is a 'suggest'/'draft' surface, never
 * an 'act' one.)
 */
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { retrieve } from '@/lib/retrieval';
import { loadCorpus, getDoc } from '@/lib/corpus';
import { buildGraph } from '@/lib/graph';
import { MemorySaver } from '@langchain/langgraph';
import { autonomyCeiling, RISK_OBLIGATIONS, AUTONOMY_GATE } from '@/lib/ladder';
import { hasModelKey, MODEL_KEY_VAR, PROVIDER } from '@/lib/llm';
import type { RoadmapItem } from '@/lib/types';

export const maxDuration = 60;

const text = (data: unknown) => ({
  content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
});

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'retrieve_pattern',
      'Hybrid search (BM25 + dense, RRF-fused) over the clean-room enterprise-AI pattern corpus (AI-or-not rubrics, autonomy-ladder tiers, reference architectures, governance tiers, adoption-failure patterns). Returns matching pattern cards.',
      {
        query: z.string().describe('what to look for, plain language or terms-of-art'),
        category: z
          .enum(['ai-or-not', 'autonomy-ladder', 'architecture', 'governance', 'adoption-failure'])
          .optional()
          .describe('restrict to one category'),
        k: z.number().int().min(1).max(15).optional().describe('number of cards (default 5)'),
      },
      async ({ query, category, k }) => {
        const r = await retrieve(query, { k: k ?? 5, categories: category ? [category] : undefined });
        return text({
          retrievalMode: r.mode,
          corpusVersion: loadCorpus().version,
          results: r.docs.map((d) => ({ id: d.doc.id, title: d.doc.title, category: d.doc.category, text: d.doc.text })),
        });
      },
    );

    server.tool(
      'get_pattern',
      'Fetch one pattern card by id, e.g. "pat-arch-human-gated-write", "pat-aon-none".',
      { id: z.string().describe('the pattern id') },
      async ({ id }) => {
        const doc = getDoc(id);
        if (!doc) return text({ error: `Pattern "${id}" does not exist in corpus ${loadCorpus().version}.` });
        return text({ id: doc.id, title: doc.title, category: doc.category, text: doc.text, implies_verdict: doc.implies_verdict, implies_tier: doc.implies_tier });
      },
    );

    server.tool(
      'diagnose_use_case',
      'Run the full triage (supervisor -> diagnostician/architect/economist -> adversarial critic) on ONE AI use-case description and return the draft verdict: AI-or-not, autonomy tier, EU AI Act risk tier, a defended architecture, and economics. IMPORTANT: this draft is UNGATED — the human-approval step the web flow enforces cannot ride a synchronous tool call. Treat the result as triage input, not a committed decision.',
      {
        title: z.string().min(3).max(160),
        description: z.string().min(15).max(4000).describe('plain-language description of the candidate AI use case'),
      },
      async ({ title, description }) => {
        if (!hasModelKey()) return text({ error: `${MODEL_KEY_VAR} not configured on this deployment (LLM_PROVIDER=${PROVIDER}).` });
        const graph = buildGraph().compile({ checkpointer: new MemorySaver() });
        const out = await graph.invoke(
          { backlog: { company_context: 'mcp', use_cases: [{ id: 'mcp-1', title, description }] }, hitlMode: 'memory' },
          { configurable: { thread_id: crypto.randomUUID(), auto_approve: true }, recursionLimit: 50 },
        );
        if (out.guardFail) return text({ rejected: out.guardFail });
        const item = (out.items as RoadmapItem[])[0];
        return text({
          ungated_draft: true,
          ai_or_not: item.diagnosis.ai_or_not,
          autonomy_tier: item.diagnosis.autonomy_tier,
          autonomy_ceiling_for_cost: autonomyCeiling(item.diagnosis.cost_of_error),
          autonomy_gate: AUTONOMY_GATE[item.diagnosis.autonomy_tier],
          risk_tier: item.diagnosis.risk_tier,
          risk_obligations: RISK_OBLIGATIONS[item.diagnosis.risk_tier],
          architecture: item.architecture,
          economics: item.economics,
          sequencing: item.sequencing,
          critic: item.critique.final,
          corpusVersion: loadCorpus().version,
        });
      },
    );
  },
  {},
  { basePath: '/api' },
);

export { handler as GET, handler as POST, handler as DELETE };
