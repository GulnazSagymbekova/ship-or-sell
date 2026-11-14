import "server-only";
import { z } from "zod";
import type { Item } from "@/types";
import { CATEGORIES } from "@/lib/categories";
import { AiInvalidOutputError, callTool } from "./client";
import { VISION_PROMPT } from "./prompts";

/** Поля, которые определяет AI. id, moveId, photoPath, sentimental, userEdited — проставляет сервер. */
export type DetectedItem = Pick<
  Item,
  | "category" | "name" | "brand" | "material" | "condition"
  | "widthIn" | "depthIn" | "heightIn" | "volumeCuFt" | "weightLb" | "aiConfidence"
>;

const dim = z.number().finite().min(0).max(600);

const DetectedItemSchema = z.object({
  category: z.enum(CATEGORIES),
  name: z.string().trim().min(1).max(120),
  brand: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .transform((b) => (b ? b : null)),
  material: z.string().trim().min(1).max(80),
  // Модель иногда отдаёт 3.5 — округляем, а не отбрасываем ответ.
  condition: z
    .number()
    .min(1)
    .max(5)
    .transform((n) => Math.round(n) as Item["condition"]),
  widthIn: dim,
  depthIn: dim,
  heightIn: dim,
  volumeCuFt: z.number().finite().min(0).max(1000),
  weightLb: z.number().finite().min(0).max(2000),
  aiConfidence: z.number().min(0).max(1),
});

const ReportSchema = z.object({ items: z.array(DetectedItemSchema).max(40) });

const REPORT_ITEMS_TOOL = {
  name: "report_items",
  description: "Report every distinct piece of furniture or large household item visible in the photo.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...CATEGORIES] },
            name: { type: "string", description: 'Short buyer-friendly name, e.g. "3-seat grey fabric sofa"' },
            brand: { type: ["string", "null"], description: "Only if clearly identifiable, else null" },
            material: { type: "string" },
            condition: { type: "integer", minimum: 1, maximum: 5 },
            widthIn: { type: "number" },
            depthIn: { type: "number" },
            heightIn: { type: "number" },
            volumeCuFt: { type: "number" },
            weightLb: { type: "number" },
            aiConfidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: [
            "category", "name", "brand", "material", "condition",
            "widthIn", "depthIn", "heightIn", "volumeCuFt", "weightLb", "aiConfidence",
          ],
        },
      },
    },
    required: ["items"],
  },
};

/**
 * Распознаёт мебель на фото. В запрос уходит ТОЛЬКО изображение.
 * Невалидный ответ — один повтор, потом AiInvalidOutputError.
 * Недоступность Claude — AiUnavailableError (решение о fallback принимает роут).
 */
export async function analyzePhoto(imageBase64: string): Promise<DetectedItem[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const input = await callTool({
      system: VISION_PROMPT,
      tool: REPORT_ITEMS_TOOL,
      maxTokens: 4096,
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
        { type: "text", text: "Report the furniture in this photo using the report_items tool." },
      ],
    });
    const parsed = ReportSchema.safeParse(input);
    if (parsed.success) return parsed.data.items;
  }
  throw new AiInvalidOutputError("report_items output failed validation twice");
}
