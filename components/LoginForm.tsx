"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIMITS, USE_MOCKS } from "@/lib/config";

const schema = z.object({ email: z.email("Enter a valid email") });
type FormValues = z.infer<typeof schema>;

/** Only allow same-site relative paths as the post-login target. */
function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/move";
}

async function sendMagicLink(email: string, next: string) {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 600));
    return;
  }
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) throw error;
}

export function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (email: string) => {
    setError(null);
    try {
      await sendMagicLink(email, next);
      setSentTo(email);
      setCooldown(LIMITS.magicLinkResendSec);
    } catch {
      setError("Couldn't send the link. Please try again in a moment.");
    }
  };

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="text-lg font-semibold">Check your email</p>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>.
          </p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          variant="outline"
          className="w-full"
          disabled={cooldown > 0 || resending}
          onClick={async () => {
            setResending(true);
            await send(sentTo);
            setResending(false);
          }}
        >
          {resending ? <Loader2 className="animate-spin" /> : null}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setSentTo(null)}
        >
          Use a different email
        </button>
        {USE_MOCKS ? (
          <a href={next} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Demo mode: continue without email →
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((v) => send(v.email))} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!form.formState.errors.email}
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
        Send magic link
      </Button>
    </form>
  );
}
