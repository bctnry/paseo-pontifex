// Small shared bits for the mobile mockups. The Paseo monogram is the
// app icon (packages/website/public/favicon.svg) with the black plate dropped,
// so it can be tinted and placed on any tile. Tile fills are the app's identity
// palette — packages/app/src/styles/identity-colors.ts — surfaced as
// `--color-mock-tile-*` tokens in styles.css.

const PASEO_MARK_D =
  "m229 0a62.454 62.454 0 0 1 62.453 62.453v83.271h-41.635v-83.271a20.818 20.818 0 0 0-20.818-20.818 20.818 20.818 0 0 0-20.818 20.818h-41.635a62.454 62.454 0 0 1 62.453-62.453zm-20.818 62.455 2e-3 249.81h-83.271l-41.637-41.635v-83.271l-83.271-83.271v-41.635zm-41.635 41.635h-83.271v24.391l17.244 17.244h41.637v41.637h-17.244v66.025l17.244 17.246h24.391z";

export function PaseoMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 291.45 312.27"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={PASEO_MARK_D} />
    </svg>
  );
}

/** A hashed identity tile — one letter on a muted identity fill. */
export function LetterTile({
  letter,
  tone,
}: {
  letter: string;
  tone: "red" | "violet" | "amber" | "teal";
}) {
  return (
    <span
      className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[10px] font-semibold text-white ${TILE_TONE[tone]}`}
    >
      {letter}
    </span>
  );
}

const TILE_TONE = {
  red: "bg-mock-tile-red",
  violet: "bg-mock-tile-violet",
  amber: "bg-mock-tile-amber",
  teal: "bg-mock-tile-teal",
} as const;

/** The Paseo project tile — white monogram on the black app plate. */
export function PaseoTile() {
  return (
    <span className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-black text-white">
      <PaseoMark size={14} />
    </span>
  );
}
