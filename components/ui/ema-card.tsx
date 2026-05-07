"use client";

import { HTMLAttributes } from "react";

import { Card } from "@/components/ui/card";

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function EmaCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <Card
      className={joinClassNames(
        "relative overflow-hidden border-torii/25 bg-washi/95 shadow-ema before:absolute before:left-1/2 before:top-3 before:h-2 before:w-2 before:-translate-x-1/2 before:rounded-full before:bg-gold-soft/90 before:content-[''] after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-to-b after:from-white/10 after:via-transparent after:to-[#D9C4A5]/20 after:content-['']",
        className,
      )}
      {...props}
    />
  );
}
