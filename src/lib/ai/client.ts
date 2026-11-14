import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-sonnet-5-5";
export const AI_TIMEOUT_MS = 25_000;

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");
  // maxRetries: 0 — повтор делаем сами (один раз), чтобы уложиться в таймаут роута.
  client ??= new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  return client;
}

/** Claude недоступен (нет ключа, сеть, таймаут, 5xx, перегрузка) — повод для DEMO_FALLBACK / 503. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Claude ответил, но дважды невалидно по схеме. */
export class AiInvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInvalidOutputError";
  }
}

export const demoFallbackEnabled = () => process.env.DEMO_FALLBACK === "true";

/** Вызов модели с принудительным инструментом. Возвращает `input` вызова инструмента. */
export async function callTool(params: {
  system: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  content: Anthropic.MessageParam["content"];
  maxTokens: number;
}): Promise<unknown> {
  const anthropic = getAnthropic();
  let res: Anthropic.Message;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: params.maxTokens,
      system: params.system,
      tools: [params.tool as Anthropic.Tool],
      tool_choice: { type: "tool", name: params.tool.name },
      messages: [{ role: "user", content: params.content }],
    });
  } catch (err) {
    const e = err as { status?: number; name?: string; message?: string };
    // 4xx (кроме 408/429) — ошибка запроса с нашей стороны, а не недоступность.
    if (typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
      throw err;
    }
    throw new AiUnavailableError(`${e.name ?? "Error"}: ${e.status ?? ""} ${String(e.message ?? "").slice(0, 120)}`);
  }
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new AiInvalidOutputError("no tool_use block");
  return block.input;
}
