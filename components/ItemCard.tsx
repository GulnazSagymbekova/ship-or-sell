"use client";

import { AlertTriangle, Heart, Pencil, Trash2 } from "lucide-react";
import type { Item } from "@/types";
import { CATEGORY_LABEL } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ItemCard({ item, onEdit, onDelete }: { item: Item; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card p-3 pr-1.5">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium">{item.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>{CATEGORY_LABEL[item.category]}</span>
          {item.aiConfidence < 0.6 && !item.userEdited ? (
            <Badge variant="warning">
              <AlertTriangle /> Please check
            </Badge>
          ) : null}
          {item.sentimental ? (
            <Badge variant="secondary">
              <Heart /> Sentimental
            </Badge>
          ) : null}
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${item.name}`}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        aria-label={`Delete ${item.name}`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
