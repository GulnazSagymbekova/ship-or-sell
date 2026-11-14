import { AlertTriangle } from "lucide-react";
import type { Item } from "@/types";
import { CATEGORY_LABEL } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";

/** Compact list of recognized items; grows live while photos are analyzed. */
export function DetectedItemList({ items, photoUrl }: { items: Item[]; photoUrl: (item: Item) => string | undefined }) {
  return (
    <ul className="divide-y rounded-xl border bg-card" aria-live="polite">
      {items.map((item) => {
        const src = photoUrl(item);
        return (
          <li
            key={item.id}
            className="flex items-center gap-3 p-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob or signed URL
              <img src={src} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="size-12 shrink-0 rounded-lg bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.name}</p>
              <p className="text-sm text-muted-foreground">{CATEGORY_LABEL[item.category]}</p>
            </div>
            {item.aiConfidence < 0.6 ? (
              <Badge variant="warning">
                <AlertTriangle /> Please check
              </Badge>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
