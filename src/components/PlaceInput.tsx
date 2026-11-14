"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { Place } from "@/lib/places";
import { api } from "@/lib/api-client";
import { cn } from "@/client/utils";
import { Input } from "@/components/ui/input";

interface PlaceInputProps {
  id: string;
  /** Выбранный ZIP (5 цифр) или "" — это значение уходит в форму. */
  value: string;
  onChange: (zip: string) => void;
  placeholder?: string;
  invalid?: boolean;
}

const isZip = (s: string) => /^\d{5}$/.test(s.trim());

/**
 * Поле «город или ZIP» с подсказками: Austin → «Austin, TX» (ZIP центра города), 78701 → сам ZIP.
 * В форму всегда уходит ZIP; пока ничего не выбрано и не введено 5 цифр — значение "".
 */
export function PlaceInput({ id, value, onChange, placeholder, invalid }: PlaceInputProps) {
  const [text, setText] = useState(value);
  const [picked, setPicked] = useState<Place | null>(null);
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const reqSeq = useRef(0);

  useEffect(() => {
    const q = text.trim();
    if (picked && text === picked.label) return; // только что выбрали — не ищем заново
    if (q.length < 2) return; // список очищает type(); здесь только запрос (без setState в теле эффекта)
    const seq = ++reqSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchPlaces(q);
        if (seq !== reqSeq.current) return;
        setOptions(res);
        setActive(0);
        // Ровно введённый ZIP — подсказку не открываем, город покажем строкой под полем.
        setOpen(res.length > 0 && !(isZip(q) && res.length === 1 && res[0].zip === q));
      } catch {
        if (seq === reqSeq.current) setOptions([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [text, picked]);

  const choose = (p: Place) => {
    const label = `${p.city}, ${p.state}`;
    setPicked({ ...p, label });
    setText(label);
    setOpen(false);
    onChange(p.zip);
  };

  const type = (v: string) => {
    setText(v);
    setPicked(null);
    onChange(isZip(v) ? v.trim() : "");
    if (v.trim().length < 2) {
      reqSeq.current++; // отменить ответ на ещё летящий запрос
      setOptions([]);
      setOpen(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault(); // не отправлять форму — сначала выбор
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const typedZipCity = isZip(text) ? options.find((o) => o.zip === text.trim()) : undefined;
  const hint = picked
    ? `ZIP ${picked.zip}`
    : typedZipCity
      ? `${typedZipCity.city}, ${typedZipCity.state}`
      : "City or ZIP — e.g. Austin, TX or 78701";

  return (
    <div className="relative">
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        aria-describedby={`${id}-hint`}
        onChange={(e) => type(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => options.length > 0 && !picked && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      <p id={`${id}-hint`} className="mt-1.5 truncate text-xs text-muted-foreground">
        {hint}
      </p>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-12 z-50 max-h-72 overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((p, i) => (
            <li
              key={`${p.zip}-${p.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, а не click: иначе blur поля закроет список раньше выбора
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm",
                i === active && "bg-accent text-accent-foreground",
              )}
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{p.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
