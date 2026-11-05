import Image from "next/image";
import logo from "../../../public/brand/logo.png";
import { cn } from "@/lib/utils";

/** The supplied 3-Clue X-Word logo (black C with 3 over pastel squares). */
export function BrandLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={logo}
      alt="3-Clue X-Word"
      priority={priority}
      className={cn("h-auto w-auto", className)}
      sizes="(max-width: 640px) 60vw, 320px"
    />
  );
}

/** Three soft waves in the clue colours (yellow, pink, blue). */
export function Waves({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={cn("pointer-events-none", className)}
    >
      <path
        d="M0 120 C 260 40, 520 40, 760 110 S 1200 200, 1440 90 L1440 220 L0 220 Z"
        className="fill-harder"
        opacity="0.9"
      />
      <path
        d="M0 160 C 300 90, 560 110, 820 150 S 1220 200, 1440 130 L1440 220 L0 220 Z"
        className="fill-medium"
        opacity="0.9"
      />
      <path
        d="M0 190 C 320 150, 640 170, 900 190 S 1250 210, 1440 175 L1440 220 L0 220 Z"
        className="fill-easier"
      />
    </svg>
  );
}

/** Decorative scattered crossword tiles. */
export function TileScatter({ className, variant = "light" }: { className?: string; variant?: "light" | "navy" }) {
  const tiles: [number, number, string][] =
    variant === "navy"
      ? [
          [40, 0, "fill-white/10"], [80, 0, "fill-white/15"], [80, 40, "fill-white/10"], [120, 40, "fill-white/15"],
          [0, 40, "fill-white/10"], [40, 80, "fill-white/15"], [120, 80, "fill-white/10"], [80, 120, "fill-white/10"],
        ]
      : [
          [0, 0, "fill-harder"], [40, 0, "fill-medium/70"], [40, 40, "fill-white"], [80, 40, "fill-easier/60"],
          [0, 80, "fill-white"], [80, 80, "fill-medium/50"], [120, 80, "fill-white"], [120, 120, "fill-easier"],
        ];
  return (
    <svg aria-hidden viewBox="0 0 160 160" className={cn("pointer-events-none", className)}>
      {tiles.map(([x, y, fill]) => (
        <rect key={`${x}-${y}`} x={x + 2} y={y + 2} width="36" height="36" rx="6" className={fill} />
      ))}
    </svg>
  );
}
