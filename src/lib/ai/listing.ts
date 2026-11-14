import "server-only";
import { z } from "zod";
import type { Estimate, Item, Listing } from "@/types";
import { AiInvalidOutputError, callTool } from "./client";
import { LISTING_PROMPT } from "./prompts";

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

const ListingOutput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
});

const WRITE_LISTING_TOOL = {
  name: "write_listing",
  description: "Return the Facebook Marketplace listing.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Max 70 characters" },
      description: { type: "string", description: "4–6 short lines separated by newlines" },
    },
    required: ["title", "description"],
  },
};

function formatDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Объявление для Marketplace. В AI уходят ТОЛЬКО атрибуты вещи, цены из Estimate,
 * название города отправки и дата переезда. Никаких ZIP, userId, email.
 */
export async function generateListing(
  item: Item,
  estimate: Estimate,
  fromCity: string | null,
  moveDate: string,
): Promise<Listing> {
  const priceQuick = round5(estimate.resaleLow);
  const priceMax = Math.max(priceQuick, round5(estimate.resaleHigh));

  const facts = {
    category: item.category,
    name: item.name,
    brand: item.brand,
    material: item.material,
    condition: item.condition,
    dimensionsIn: { width: Math.round(item.widthIn), depth: Math.round(item.depthIn), height: Math.round(item.heightIn) },
    weightLb: Math.round(item.weightLb),
    askingPriceUsd: priceMax,
    lowestAcceptableUsd: priceQuick,
    pickupCity: fromCity ?? "my city",
    mustGoBy: formatDate(moveDate),
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const input = await callTool({
      system: LISTING_PROMPT,
      tool: WRITE_LISTING_TOOL,
      maxTokens: 800,
      content: [{ type: "text", text: `Item facts (JSON):\n${JSON.stringify(facts)}` }],
    });
    const parsed = ListingOutput.safeParse(input);
    if (parsed.success) {
      return {
        itemId: item.id,
        title: parsed.data.title.slice(0, 70),
        description: parsed.data.description,
        priceQuick,
        priceMax,
      };
    }
  }
  throw new AiInvalidOutputError("write_listing output failed validation twice");
}

const CONDITION_TEXT: Record<Item["condition"], string> = {
  1: "Heavily used, priced to go — see photos for wear.",
  2: "Well used with visible wear, fully functional.",
  3: "Normal signs of use, in good working shape.",
  4: "Very good condition with minimal wear.",
  5: "Like new.",
};

/** Шаблонное объявление без AI — для DEMO_FALLBACK, когда Claude недоступен. */
export function templateListing(
  item: Item,
  estimate: Estimate,
  fromCity: string | null,
  moveDate: string,
): Listing {
  const priceQuick = round5(estimate.resaleLow);
  const priceMax = Math.max(priceQuick, round5(estimate.resaleHigh));
  const what = [item.brand, item.name].filter(Boolean).join(" ");
  const title = `${what} – ${item.material}`.slice(0, 70);
  const description = [
    `${what}, ${item.material}.`,
    `Dimensions: ${Math.round(item.widthIn)}" W x ${Math.round(item.depthIn)}" D x ${Math.round(item.heightIn)}" H.`,
    CONDITION_TEXT[item.condition],
    `Moving out of state — must go by ${formatDate(moveDate)}.`,
    `Pickup only in ${fromCity ?? "town"}${item.weightLb > 60 ? ", please bring help to carry" : ""}.`,
    "Message me if it's still listed — it's available.",
  ].join("\n");
  return { itemId: item.id, title, description, priceQuick, priceMax };
}
