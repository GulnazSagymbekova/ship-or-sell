"use client";

import { useState } from "react";
import { AlertTriangle, Heart, Pencil, Trash2 } from "lucide-react";
import type { Item } from "@/types";
import { CATEGORY_LABEL } from "@/client/labels";
import { cn } from "@/client/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ItemCard({
  item,
  onEdit,
  onDelete,
  onToggleSentimental,
}: {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
  onToggleSentimental: () => void;
}) {
  // Delete in two taps: the first one turns the bin into a red "Delete" button. It stays until
  // you tap it or tap anywhere else (no timer: in testing it vanished before people could tap).
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card p-3 pr-1">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium">{item.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>
            {CATEGORY_LABEL[item.category]}
            {item.brand ? ` · ${item.brand}` : null}
          </span>
          {item.aiConfidence < 0.6 && !item.userEdited ? (
            <Badge variant="warning">
              <AlertTriangle /> Please check
            </Badge>
          ) : null}
          {item.sentimental ? <Badge variant="secondary">Keeping — sentimental</Badge> : null}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSentimental}
        aria-pressed={item.sentimental}
        aria-label={item.sentimental ? `Unmark ${item.name} as sentimental` : `Mark ${item.name} as sentimental`}
      >
        <Heart className={cn(item.sentimental ? "fill-rose-500 text-rose-500" : "text-muted-foreground")} />
      </Button>
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${item.name}`}>
        <Pencil />
      </Button>
      {confirming ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            setConfirming(false);
            onDelete();
          }}
          onBlur={() => setConfirming(false)}
          aria-label={`Confirm delete ${item.name}`}
          className="shrink-0"
          autoFocus
        >
          Delete
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${item.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
