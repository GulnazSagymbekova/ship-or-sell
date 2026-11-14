"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";

function Calendar({ className, ...props }: React.ComponentProps<typeof DayPicker>) {
  return <DayPicker data-slot="calendar" className={cn("p-1 text-sm", className)} {...props} />;
}

export { Calendar };
