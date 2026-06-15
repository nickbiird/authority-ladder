import { NextRequest } from 'next/server';
import { buildGraph } from '@/lib/graph';
import { getCheckpointer } from '@/lib/checkpointer';
import { checkRateLimit } from '@/lib/ratelimit';
import { sseResponse } from '@/lib/stream';
import { Backlog } from '@/lib/types';
import { hasModelKey, MODEL_KEY_VAR, PROVIDER } from '@/lib/llm';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!hasModelKey()) {
    return Response.json(
      { error: `${MODEL_KEY_VAR} is not configured on this deployment (LLM_PROVIDER=${PROVIDER}). Clone the repo and run it with your own key — see README.` },
      { status: 503 },
    );
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return Response.json(
      { error: 'Daily demo limit reached for this IP. Clone the repo and run it with your own key.' },
      { status: 429 },
    );
  }

  const parsed = Backlog.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: 'Provide a backlog: { company_context, use_cases: [{id,title,description}] } (1–20 items).' }, { status: 400 });
  }

  const { saver, mode } = await getCheckpointer();
  const graph = buildGraph().compile({ checkpointer: saver });
  const threadId = crypto.randomUUID();

  return sseResponse(
    threadId,
    () =>
      graph.stream(
        { backlog: parsed.data, hitlMode: mode },
        { configurable: { thread_id: threadId }, streamMode: 'updates', recursionLimit: 100 },
      ) as unknown as Promise<AsyncIterable<Record<string, unknown>>>,
  );
}
