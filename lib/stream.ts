/**
 * Turns a LangGraph state stream into an SSE response. Each graph node update
 * becomes one event; an interrupt becomes an "awaiting_approval" event carrying
 * the draft roadmap and the thread id the client needs to resume.
 *
 * The graph processes the backlog one use case per `triage_one` iteration (a
 * self-loop), so the client gets per-item progress with the proven
 * streamMode:'updates' — no custom-stream API needed. Per-token streaming of the
 * architect's prose is a deliberate deferral (see AGENTS.md).
 */

export interface SseEvent {
  type: 'meta' | 'node' | 'item' | 'awaiting_approval' | 'roadmap' | 'guard_fail' | 'error';
  node?: string;
  data?: unknown;
  threadId?: string;
}

export function sseResponse(
  threadId: string,
  iterate: () => Promise<AsyncIterable<Record<string, unknown>>>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        send({ type: 'meta', threadId });
        for await (const update of await iterate()) {
          for (const [node, value] of Object.entries(update)) {
            if (node === '__interrupt__') {
              const interrupts = value as { value: unknown }[];
              send({ type: 'awaiting_approval', threadId, data: interrupts[0]?.value });
              continue;
            }
            const v = value as Record<string, unknown> | null;
            if (v && 'guardFail' in v && v.guardFail) {
              send({ type: 'guard_fail', node, data: v.guardFail });
            } else if (v && 'roadmap' in v && v.roadmap) {
              send({ type: 'roadmap', node, data: v.roadmap });
            } else if (node === 'triage_one' && v && Array.isArray(v.items) && v.items.length) {
              // the self-loop appends exactly one item per iteration
              send({ type: 'item', node, data: (v.items as unknown[])[v.items.length - 1] });
            } else {
              send({ type: 'node', node, data: summarize(node, v) });
            }
          }
        }
      } catch (err) {
        send({ type: 'error', data: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

/** Strip node outputs down to what the trace UI shows — full state stays server-side. */
function summarize(node: string, v: Record<string, unknown> | null): unknown {
  if (!v) return null;
  switch (node) {
    case 'guard':
      return { piiFound: v.piiFound ?? [] };
    case 'supervise':
      return { routes: v.routes };
    case 'gate':
      return v.approval ?? { awaiting: true };
    default:
      return null;
  }
}

export interface ResumePayload {
  approved: boolean;
  note?: string | null;
}
