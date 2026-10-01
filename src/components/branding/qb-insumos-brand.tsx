"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

type QbInsumosBrandProps = {
  systemName?: string;
  logoUrl?: string | null;
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  showSubtitle?: boolean;
  showText?: boolean;
  variant?: "compact" | "default" | "hero";
};

const logoSizes = {
  compact: "size-12",
  default: "size-16",
  hero: "size-24",
};

const textSizes = {
  compact: "text-base",
  default: "text-lg",
  hero: "text-3xl",
};

export function QbInsumosBrand({
  systemName = "QB Insumos",
  logoUrl,
  className,
  logoClassName,
  textClassName,
  showSubtitle = false,
  showText = true,
  variant = "default",
}: QbInsumosBrandProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  if (logoFailed) {
    return (
      <div className={cn("flex min-w-0 items-center", className)}>
        <div className="min-w-0">
          <p
            className={cn(
              "font-heading font-semibold leading-tight tracking-tight",
              textSizes[variant],
              textClassName,
            )}
          >
            {systemName}
          </p>
          {showSubtitle ? (
            <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Alimenticios
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md bg-white",
          logoSizes[variant],
          logoClassName,
        )}
      >
        <Image
          src={logoUrl ?? "/logo.jpeg"}
          alt={systemName}
          unoptimized={Boolean(logoUrl)}
          width={500}
          height={500}
          className="h-full w-full object-contain"
          sizes={
            variant === "hero"
              ? "96px"
              : variant === "default"
                ? "64px"
                : "48px"
          }
          priority={variant === "hero"}
          onError={() => setLogoFailed(true)}
        />
      </div>

      {showText ? (
        <div className="min-w-0">
          <p
            className={cn(
              "font-heading font-semibold leading-tight tracking-tight",
              textSizes[variant],
              textClassName,
            )}
          >
            {systemName}
          </p>
          {showSubtitle ? (
            <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Alimenticios
            </p>
          ) : null}
        </div>
      ) : (
        <span className="sr-only">{systemName}</span>
      )}
    </div>
  );
}
