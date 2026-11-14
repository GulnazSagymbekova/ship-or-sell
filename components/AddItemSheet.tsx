"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Category, Item } from "@/types";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { CATEGORY_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

/** Manual add for an item the AI missed, attached to the same photo. */
export function AddItemSheet({
  moveId,
  photoPath,
  onOpenChange,
  onAdded,
}: {
  moveId: string;
  photoPath: string | null;
  onOpenChange: (open: boolean) => void;
  onAdded: (item: Item) => void;
}) {
  const [category, setCategory] = useState<Category>("sofa");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoPath) return;
    const trimmed = name.trim() || CATEGORY_LABEL[category];
    setBusy(true);
    setError(null);
    try {
      const item = await api.addItem({ moveId, photoPath, category, name: trimmed });
      setName("");
      onAdded(item);
    } catch (err) {
      setError(errorMessage(err, { rate_limited: "You've reached the limit of 60 items for this move." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!photoPath} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add missing item</SheetTitle>
          <SheetDescription>We&apos;ll fill in typical size and weight for the category.</SheetDescription>
        </SheetHeader>
        <form id="add-item" onSubmit={submit} className="space-y-4 px-5">
          <div className="space-y-2">
            <Label htmlFor="add-category">Category</Label>
            <NativeSelect id="add-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-name">Name</Label>
            <Input
              id="add-name"
              value={name}
              maxLength={80}
              placeholder={`e.g. ${CATEGORY_LABEL[category]}`}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <SheetFooter>
          <Button type="submit" form="add-item" size="lg" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Add item
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
