/**
 * Managed Agents — Generic Session Executor
 *
 * Opens a session, sends a user prompt, processes the SSE event stream,
 * handles custom tool calls by dispatching to provided handlers, and
 * returns the agent's final text response.
 */
import { getClient, getOrCreateEnvironment } from './client';

export interface SessionResult {
  text: string;
  toolCallsExecuted: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

/**
 * Run a single-turn managed agent session.
 *
 * @param agentId - The agent ID (e.g., SOCIAL_MEDIA_AGENT_ID)
 * @param prompt - The user prompt to send
 * @param toolHandlers - Map of tool name -> handler function
 * @param options - Optional config (timeout, metadata)
 */
export async function runAgentSession(
  agentId: string,
  prompt: string,
  toolHandlers: Record<string, (input: any) => Promise<any>>,
  options?: { timeoutMs?: number; metadata?: Record<string, string> }
): Promise<SessionResult> {
  const client = getClient();
  const environmentId = await getOrCreateEnvironment();
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000; // 5 minutes default

  // Create session
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
    metadata: options?.metadata,
  });

  const sessionId = session.id;
  console.log(`[ManagedAgents] Session created: ${sessionId} for agent ${agentId}`);

  // Send user message
  await client.beta.sessions.events.send(sessionId, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: prompt }],
      },
    ],
  });

  // Track results
  const collectedText: string[] = [];
  let toolCallsExecuted = 0;
  let lastUsage: SessionResult['usage'] | undefined;

  // Timeout controller
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    console.warn(`[ManagedAgents] Session ${sessionId} timed out after ${timeoutMs}ms`);
  }, timeoutMs);

  try {
    // Poll for events using the stream endpoint
    // The stream returns SSE events as they happen
    let sessionDone = false;

    while (!sessionDone && !timedOut) {
      const stream = await client.beta.sessions.events.stream(sessionId);

      for await (const event of stream) {
        if (timedOut) break;

        switch (event.type) {
          case 'agent.message': {
            // Collect text blocks from agent messages
            const msgEvent = event as any;
            if (msgEvent.content) {
              for (const block of msgEvent.content) {
                if (block.type === 'text') {
                  collectedText.push(block.text);
                }
              }
            }
            break;
          }

          case 'agent.custom_tool_use': {
            // Agent wants to call one of our custom tools
            const toolEvent = event as any;
            const toolName = toolEvent.name;
            const toolInput = toolEvent.input;
            const toolUseId = toolEvent.id;

            console.log(`[ManagedAgents] Tool call: ${toolName}(${JSON.stringify(toolInput).substring(0, 200)})`);

            let resultContent: string;
            let isError = false;

            const handler = toolHandlers[toolName];
            if (handler) {
              try {
                const result = await handler(toolInput);
                resultContent = typeof result === 'string' ? result : JSON.stringify(result);
                toolCallsExecuted++;
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[ManagedAgents] Tool ${toolName} error:`, errMsg);
                resultContent = JSON.stringify({ error: errMsg });
                isError = true;
              }
            } else {
              console.warn(`[ManagedAgents] Unknown tool: ${toolName}`);
              resultContent = JSON.stringify({ error: `Unknown tool: ${toolName}` });
              isError = true;
            }

            // Send tool result back
            await client.beta.sessions.events.send(sessionId, {
              events: [
                {
                  type: 'user.custom_tool_result',
                  custom_tool_use_id: toolUseId,
                  content: [{ type: 'text', text: resultContent }],
                  is_error: isError,
                },
              ],
            });
            break;
          }

          case 'session.status_idle': {
            const idleEvent = event as any;
            const stopReason = idleEvent.stop_reason;

            if (stopReason?.type === 'end_turn') {
              // Agent finished naturally
              sessionDone = true;
            } else if (stopReason?.type === 'requires_action') {
              // The session is blocked on events we need to handle.
              // The stream will have already emitted the custom_tool_use events
              // which we handled above. The loop will continue after we sent
              // the tool results. We need to re-open the stream to get new events.
              break;
            } else if (stopReason?.type === 'retries_exhausted') {
              console.error(`[ManagedAgents] Session ${sessionId} retries exhausted`);
              sessionDone = true;
            }
            break;
          }

          case 'session.status_terminated': {
            console.error(`[ManagedAgents] Session ${sessionId} terminated`);
            sessionDone = true;
            break;
          }

          case 'session.error': {
            const errEvent = event as any;
            const errMsg = errEvent.error?.message || 'Unknown session error';
            const retryStatus = errEvent.error?.retry_status?.type;

            if (retryStatus === 'terminal') {
              console.error(`[ManagedAgents] Terminal error in session ${sessionId}: ${errMsg}`);
              sessionDone = true;
            } else if (retryStatus === 'exhausted') {
              console.error(`[ManagedAgents] Retries exhausted in session ${sessionId}: ${errMsg}`);
              sessionDone = true;
            } else {
              // retrying — just log and continue waiting
              console.warn(`[ManagedAgents] Retrying after error in session ${sessionId}: ${errMsg}`);
            }
            break;
          }

          case 'span.model_request_end': {
            // Track usage from model requests
            const spanEvent = event as any;
            if (spanEvent.model_usage) {
              lastUsage = {
                inputTokens: (lastUsage?.inputTokens ?? 0) + (spanEvent.model_usage.input_tokens ?? 0),
                outputTokens: (lastUsage?.outputTokens ?? 0) + (spanEvent.model_usage.output_tokens ?? 0),
              };
            }
            break;
          }

          // Ignore other event types (thinking, running, rescheduled, etc.)
          default:
            break;
        }

        if (sessionDone) break;
      }

      // If session is idle with requires_action, the stream ended.
      // We need to re-open the stream to continue after sending tool results.
      // The while loop handles this.
    }
  } finally {
    clearTimeout(timeoutHandle);

    // Clean up: try to delete the session (fire-and-forget)
    client.beta.sessions.delete(sessionId).catch((err: any) => {
      console.warn(`[ManagedAgents] Failed to delete session ${sessionId}:`, err?.message);
    });
  }

  if (timedOut && collectedText.length === 0) {
    throw new Error(`Managed agent session timed out after ${timeoutMs}ms`);
  }

  const finalText = collectedText.join('\n').trim();
  console.log(`[ManagedAgents] Session ${sessionId} complete: ${toolCallsExecuted} tool calls, ${finalText.length} chars response`);

  return {
    text: finalText,
    toolCallsExecuted,
    usage: lastUsage,
  };
}
