/**
 * Chat provider over an OpenAI-compatible endpoint. Either an OpenAI key or a
 * Groq key works (same request shape, same tool-calling contract) so the
 * analyst runs on whichever is configured. The key lives only on the server; a
 * visitor configures nothing. With no key at all the caller degrades to the
 * deterministic writer, so a correct verdict never depends on the LLM.
 *
 * Models are real and resolvable, not future-dated placeholders. Primary is a
 * strong, cheap tool-caller; the fallback covers a cold or rate-limited primary.
 */
interface Backend {
  endpoint: string;
  key: string;
  primary: string;
  fallback: string;
}

function backend(): Backend | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      endpoint: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      primary: "gpt-4o-mini",
      fallback: "gpt-4o",
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      primary: "llama-3.3-70b-versatile",
      fallback: "openai/gpt-oss-20b",
    };
  }
  return null;
}

export function hasProvider(): boolean {
  return backend() !== null;
}

/** Label for the trace, so the console names the model actually driving the loop. */
export function providerModel(): string {
  return backend()?.primary ?? "none";
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatChoice {
  message: { content: string | null; tool_calls?: ToolCall[] };
  finish_reason: string;
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
}

export async function chat(
  messages: ChatMessage[],
  tools: ToolSchema[],
  opts: { toolChoice?: "auto" | "none"; temperature?: number } = {},
): Promise<ChatResponse> {
  const be = backend();
  if (!be) throw new Error("no provider key");

  const body = {
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: 1200,
    ...(tools.length ? { tools, tool_choice: opts.toolChoice ?? "auto" } : {}),
  };

  const call = async (model: string) => {
    const res = await fetch(be.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${be.key}`,
      },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`provider ${res.status}: ${await res.text().catch(() => "")}`);
    const json = (await res.json()) as { choices: ChatChoice[] };
    const choice = json.choices?.[0];
    if (!choice) throw new Error("empty completion");
    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls ?? [],
      finishReason: choice.finish_reason,
    };
  };

  try {
    return await call(be.primary);
  } catch {
    return await call(be.fallback);
  }
}
