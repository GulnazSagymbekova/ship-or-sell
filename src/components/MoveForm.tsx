"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarIcon, Check, Loader2 } from "lucide-react";
import type { MoveType } from "@/types";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/client/errors";
import { MOVE_TYPES } from "@/client/labels";
import { cn } from "@/client/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { PlaceInput } from "@/components/PlaceInput";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const zip = z.string().regex(/^\d{5}$/, "Pick a city from the list or enter a 5-digit ZIP");

const schema = z
  .object({
    fromZip: zip,
    toZip: zip,
    moveDate: z.date({ error: "Pick your move date" }),
    moveType: z.enum(["diy_truck", "container", "full_service"], { error: "Choose how you're moving" }),
  })
  .refine((v) => v.fromZip !== v.toZip, { path: ["toZip"], message: "Destination must differ from origin" });

type FormValues = z.infer<typeof schema>;

const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Days needed to list and sell before the move — the plan's "sell by" dates need room. */
const MIN_DAYS_AHEAD = 3;

/**
 * Days before today + MIN_DAYS_AHEAD and anything over 2 years ahead are disabled.
 * Evaluated lazily (only when the calendar opens), so it's prerender-safe.
 */
function isPast(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() + MIN_DAYS_AHEAD);
  const latest = new Date(today);
  latest.setFullYear(latest.getFullYear() + 2);
  return d < earliest || d > latest;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export function MoveForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fromZip: "", toZip: "", moveDate: undefined, moveType: undefined },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (v: FormValues) => {
    setSubmitError(null);
    try {
      const move = await api.createMove({
        fromZip: v.fromZip,
        toZip: v.toZip,
        moveDate: toIsoDate(v.moveDate),
        moveType: v.moveType,
      });
      router.push(`/move/${move.id}`);
    } catch (e) {
      setSubmitError(
        errorMessage(e, { validation: "We couldn't find one of those ZIP codes. Please check them." }),
      );
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["fromZip", "toZip"] as const).map((name) => (
          <div key={name} className="space-y-2">
            <Label htmlFor={name}>{name === "fromZip" ? "From" : "To"}</Label>
            <Controller
              control={form.control}
              name={name}
              render={({ field }) => (
                <PlaceInput
                  id={name}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={name === "fromZip" ? "New York, NY" : "Austin, TX"}
                  invalid={!!errors[name]}
                />
              )}
            />
            <FieldError message={errors[name]?.message} />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="moveDate">Move date</Label>
        <Controller
          control={form.control}
          name="moveDate"
          render={({ field }) => (
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="moveDate"
                  type="button"
                  variant="outline"
                  aria-invalid={!!errors.moveDate}
                  className={cn(
                    "w-full justify-start font-normal",
                    !field.value && "text-muted-foreground",
                    errors.moveDate && "border-destructive",
                  )}
                >
                  <CalendarIcon />
                  {field.value
                    ? field.value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                    : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="start">
                <Calendar
                  mode="single"
                  selected={field.value}
                  onSelect={(d) => {
                    field.onChange(d);
                    if (d) setDateOpen(false);
                  }}
                  disabled={isPast}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          )}
        />
        {errors.moveDate ? (
          <FieldError message={errors.moveDate.message} />
        ) : (
          <p className="text-xs text-muted-foreground">At least {MIN_DAYS_AHEAD} days out, so you have time to sell.</p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Move type</legend>
        <Controller
          control={form.control}
          name="moveType"
          render={({ field }) => (
            <div role="radiogroup" className="grid gap-3">
              {MOVE_TYPES.map((opt) => {
                const selected = field.value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => field.onChange(opt.value as MoveType)}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors",
                      selected ? "border-primary ring-2 ring-primary/30" : "hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        selected && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {selected ? <Check className="size-3" /> : null}
                    </span>
                    <span>
                      <span className="block font-medium">{opt.label}</span>
                      <span className="block text-sm text-muted-foreground">{opt.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        />
        <FieldError message={errors.moveType?.message} />
      </fieldset>

      {submitError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : null}
        Continue
      </Button>
    </form>
  );
}
