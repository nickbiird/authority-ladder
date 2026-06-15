/**
 * Checkpointer selection — where the durable-HITL claim becomes true or false.
 *
 * DATABASE_URL set   -> PostgresSaver: a pending approval survives restarts,
 *                       deploys, and fresh serverless invocations. The approver
 *                       can come back tomorrow and the roadmap is still pending.
 * DATABASE_URL unset -> MemorySaver: the approval only survives while this
 *                       process lives. On serverless that means "usually not".
 *
 * The mode is reported in every run instead of being hidden, because an
 * ephemeral approval gate that looks durable is worse than no gate at all — it
 * manufactures false audit confidence. This is the exact design gap this
 * project criticises in ephemeral-HITL platforms (interrupt()+checkpointer vs an
 * in-memory prompt that dies with the process).
 *
 * The factory degrades safely: a missing driver / unreachable DB falls back to
 * memory with a warning, so the default path never breaks a demo.
 */
import { MemorySaver } from '@langchain/langgraph';
import type { CheckpointerMode } from './types';

let saver: MemorySaver | unknown | null = null;
let mode: CheckpointerMode = 'memory';
let setupDone = false;

export async function getCheckpointer(): Promise<{ saver: any; mode: CheckpointerMode }> {
  if (!saver) {
    const url = process.env.DATABASE_URL;
    if (url) {
      try {
        const { PostgresSaver } = await import('@langchain/langgraph-checkpoint-postgres');
        saver = PostgresSaver.fromConnString(url);
        mode = 'postgres';
      } catch (err) {
        console.warn(
          `[checkpointer] DATABASE_URL is set but PostgresSaver could not load (${
            err instanceof Error ? err.message : String(err)
          }); falling back to in-memory. The gate works but a pending approval will NOT survive a restart.`,
        );
        saver = new MemorySaver();
        mode = 'memory';
      }
    } else {
      saver = new MemorySaver();
      mode = 'memory';
    }
  }
  if (mode === 'postgres' && !setupDone) {
    try {
      await (saver as { setup: () => Promise<void> }).setup();
      setupDone = true;
    } catch (err) {
      console.warn(
        `[checkpointer] PostgresSaver.setup() failed (${
          err instanceof Error ? err.message : String(err)
        }); falling back to in-memory.`,
      );
      saver = new MemorySaver();
      mode = 'memory';
    }
  }
  return { saver, mode };
}
