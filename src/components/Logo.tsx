/**
 * Bink's mark: a cat face shaped like a speech bubble (the tail doubles as
 * both a chin and a "this one talks" cue), tying the mascot to content and
 * conversation. Colors are hardcoded to match the palette in globals.css
 * since this SVG needs to look right standalone, not just themed via CSS vars.
 */
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="14" y="14" width="80" height="80" rx="24" fill="#FCE0D0" opacity="0.45" />

      {/* ears */}
      <polygon points="33,38 41,15 51,39" fill="#B8600A" />
      <polygon points="75,39 67,15 57,38" fill="#B8600A" />

      {/* head, shaped as a speech bubble with a tail at bottom-left */}
      <path
        d="M35 30 h38 a15 15 0 0 1 15 15 v14 a15 15 0 0 1 -15 15 h-19 l-11 11 v-11 h-8 a15 15 0 0 1 -15 -15 v-14 a15 15 0 0 1 15 -15 Z"
        fill="#E8842E"
      />

      {/* face */}
      <circle cx="46" cy="51" r="4.2" fill="#FCF5F7" />
      <circle cx="66" cy="51" r="4.2" fill="#FCF5F7" />
      <circle cx="56" cy="60" r="2.4" fill="#6A3FA0" />
    </svg>
  );
}
