"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Star } from "lucide-react";
import type { Category, Item } from "@/types";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { CATEGORY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
const dim = z.coerce.number<string | number>().positive("> 0").max(300, "Too big");

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  category: z.enum(CATEGORIES as [Category, ...Category[]]),
  brand: z.string().trim().max(60),
  material: z.string().trim().max(60),
  condition: z.number().int().min(1).max(5),
  widthIn: dim,
  depthIn: dim,
  heightIn: dim,
  sentimental: z.boolean(),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

const CONDITION_LABEL = ["Poor", "Fair", "Good", "Very good", "Like new"];

function toForm(item: Item): FormIn {
  return {
    name: item.name,
    category: item.category,
    brand: item.brand ?? "",
    material: item.material,
    condition: item.condition,
    widthIn: item.widthIn,
    depthIn: item.depthIn,
    heightIn: item.heightIn,
    sentimental: item.sentimental,
  };
}

export function ItemEditSheet({
  item,
  onOpenChange,
  onSaved,
}: {
  item: Item | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: Item) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (item) {
      form.reset(toForm(item));
      setError(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on open
    }
  }, [item, form]);

  const onSubmit = async (v: FormOut) => {
    if (!item) return;
    setError(null);
    try {
      const saved = await api.updateItem(item.id, {
        name: v.name,
        category: v.category,
        brand: v.brand || null,
        material: v.material,
        condition: v.condition as Item["condition"],
        widthIn: v.widthIn,
        depthIn: v.depthIn,
        heightIn: v.heightIn,
        sentimental: v.sentimental,
        userEdited: true,
      });
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e, { network: "Couldn't save. Check your connection and try again." }));
    }
  };

  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit item</SheetTitle>
          <SheetDescription>Fix anything our AI got wrong.</SheetDescription>
        </SheetHeader>
        <form id="edit-item" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto px-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" aria-invalid={!!errors.name} {...form.register("name")} />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <NativeSelect id="category" {...form.register("category")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" placeholder="Optional" {...form.register("brand")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material">Material</Label>
              <Input id="material" {...form.register("material")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Condition</Label>
            <Controller
              control={form.control}
              name="condition"
              render={({ field }) => (
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Condition">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={field.value === n}
                      aria-label={`${n} – ${CONDITION_LABEL[n - 1]}`}
                      onClick={() => field.onChange(n)}
                      className="grid size-11 place-items-center rounded-md hover:bg-accent"
                    >
                      <Star
                        className={cn(
                          "size-6",
                          n <= (field.value ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                        )}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">{CONDITION_LABEL[(field.value ?? 1) - 1]}</span>
                </div>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Size (inches)</Label>
            <div className="grid grid-cols-3 gap-3">
              {(["widthIn", "depthIn", "heightIn"] as const).map((k, i) => (
                <div key={k} className="space-y-1">
                  <Input
                    inputMode="decimal"
                    aria-label={["Width", "Depth", "Height"][i]}
                    aria-invalid={!!errors[k]}
                    {...form.register(k)}
                  />
                  <p className={cn("text-xs", errors[k] ? "text-destructive" : "text-muted-foreground")}>
                    {errors[k]?.message ?? ["W", "D", "H"][i]}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-card p-3">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" {...form.register("sentimental")} />
            <span className="text-sm">
              <span className="font-medium">Sentimental — always ship</span>
              <span className="block text-muted-foreground">We&apos;ll keep it in your plan no matter the numbers.</span>
            </span>
          </label>
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <SheetFooter>
          <Button type="submit" form="edit-item" size="lg" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
