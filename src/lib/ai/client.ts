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
      // claude-sonnet-5-5 не поддерживает tool_choice "tool"/"any" (400 invalid_request_error),
      // поэтому auto + явная инструкция. Нет tool_use в ответе → AiInvalidOutputError → повтор.
      system: `${params.system}\n\nAlways respond by calling the ${params.tool.name} tool exactly once. Do not reply with plain text.`,
      tools: [params.tool as Anthropic.Tool],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: params.content }],
    });
  } catch (err) {
    // Любая ошибка API (сеть, таймаут, 429, 5xx, а также 4xx) → AiUnavailableError:
    // роут решит — DEMO_FALLBACK или 503. Статус и текст попадут в лог для отладки.
    const e = err as { status?: number; name?: string; message?: string };
    throw new AiUnavailableError(`${e.name ?? "Error"}: ${e.status ?? ""} ${String(e.message ?? "").slice(0, 200)}`);
  }
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new AiInvalidOutputError("no tool_use block");
  return block.input;
}

/** Только в `next dev`: текст ошибки AI в ответе API для отладки. На проде — пусто. */
export function devDetail(err: unknown): string {
  if (process.env.NODE_ENV !== "development") return "";
  return ` [dev: ${String((err as Error)?.message ?? err).slice(0, 300)}]`;
}
