import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage, toApiError } from "@/lib/errors";

/** Full-block error with Retry. not_found gets a link back to /move instead. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const kind = toApiError(error).kind;
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <p className="text-sm">{errorMessage(error)}</p>
      {kind === "not_found" ? (
        <Button asChild variant="outline">
          <Link href="/move">Go to my moves</Link>
        </Button>
      ) : onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
