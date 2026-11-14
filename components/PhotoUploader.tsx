"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, ImagePlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { LIMITS } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Drop zone + pickers. Validates on the client before anything is sent:
 * image/* only, ≤ 10 MB each, and never more than `remaining` photos.
 */
export function PhotoUploader({ remaining, onFiles }: { remaining: number; onFiles: (files: File[]) => void }) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = remaining <= 0;

  const accept = (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length < files.length) toast.error("Only photos can be uploaded.");
    const small = images.filter((f) => f.size <= LIMITS.maxPhotoBytes);
    if (small.length < images.length) toast.error("Some photos are over 10 MB and were skipped.");
    if (small.length > remaining) toast.error(`Max ${LIMITS.maxPhotosPerMove} photos per move`);
    const take = small.slice(0, Math.max(0, remaining));
    if (take.length) onFiles(take);
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    accept(e.target.files);
    e.target.value = ""; // allow re-selecting the same file
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={full}
        onClick={() => !full && libraryRef.current?.click()}
        onKeyDown={(e) => {
          if (!full && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            libraryRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (full) toast.error(`Max ${LIMITS.maxPhotosPerMove} photos per move`);
          else accept(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card p-6 text-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          dragging ? "border-primary bg-accent" : "border-input hover:bg-accent/60",
          full && "cursor-not-allowed opacity-60",
        )}
      >
        <ImagePlus className="size-10 text-primary" aria-hidden />
        <div>
          <p className="text-lg font-semibold">Take or upload photos</p>
          <p className="text-sm text-muted-foreground">
            {full
              ? `You've added the maximum of ${LIMITS.maxPhotosPerMove} photos.`
              : "One photo can include several pieces of furniture."}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {remaining > 0 ? `${remaining} of ${LIMITS.maxPhotosPerMove} left` : null}
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full sm:hidden"
        disabled={full}
        onClick={() => cameraRef.current?.click()}
      >
        <Camera /> Take a photo
      </Button>

      <input ref={libraryRef} type="file" accept="image/*" multiple hidden onChange={onInput} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={onInput} />

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden />
        We remove location data from your photos.{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy
        </Link>
      </p>
    </div>
  );
}
