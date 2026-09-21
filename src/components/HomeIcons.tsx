type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CodeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m8 8-4.5 4L8 16" />
      <path d="m16 8 4.5 4L16 16" />
      <path d="m13.5 5-3 14" />
    </svg>
  );
}

export function CompassIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m14.5 9.5-1.7 4.3a1 1 0 0 1-.56.56L7.9 16l1.7-4.3a1 1 0 0 1 .56-.56L14.5 9.5Z" />
    </svg>
  );
}

export function BulbIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.45.9 1.15.9 1.9V16h5.4v-.3c0-.75.3-1.45.9-1.9A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14.5 5.5 18.5 9.5 8 20H4v-4Z" />
      <path d="m13 7 4 4" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v6A2.5 2.5 0 0 1 17.5 15H10l-4 4v-4H6.5A2.5 2.5 0 0 1 4 12.5Z" />
      <path d="M8 8.7h8" />
      <path d="M8 11.3h5" />
    </svg>
  );
}

export function TargetIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function QuoteIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 15c-1.5 0-2.5-1.1-2.5-2.6C3.5 9.2 5.6 6.4 9 5.5" />
      <path d="M6 15h2.5V10H5" />
      <path d="M15 15c-1.5 0-2.5-1.1-2.5-2.6 0-3.2 2.1-6 5.5-6.9" />
      <path d="M15 15h2.5V10H14" />
    </svg>
  );
}

export function GithubIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15.5 21v-3.2c0-.9-.3-1.5-.7-1.9 2.3-.3 4.7-1.1 4.7-5.1 0-1.1-.4-2-1.1-2.8.1-.3.5-1.3-.1-2.8 0 0-.9-.3-2.9 1.1a10 10 0 0 0-5.3 0C8.1 4.9 7.2 5.2 7.2 5.2c-.6 1.5-.2 2.5-.1 2.8-.7.8-1.1 1.7-1.1 2.8 0 4 2.4 4.8 4.7 5.1-.3.3-.6.8-.7 1.5V21" />
      <path d="M10 18.5c-2.5.8-4-.5-4.5-1.5" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4l16 16" />
      <path d="M20 4 4 20" />
    </svg>
  );
}

export function LinkedinIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 10.5V17" />
      <circle cx="8" cy="7.5" r=".9" fill="currentColor" stroke="none" />
      <path d="M12 17v-4a2 2 0 0 1 4 0v4" />
      <path d="M12 10.5V17" />
    </svg>
  );
}

export function GlobeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S9.5 6.1 12 3.5Z" />
    </svg>
  );
}

export function RocketIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3c2.4 1.4 4 4.2 4 8 0 2-.5 3.6-1.2 4.9L12 18l-2.8-2.1C8.5 14.6 8 13 8 11c0-3.8 1.6-6.6 4-8Z" />
      <circle cx="12" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="M9.3 15.5 7 17.8V21l3-1.3" />
      <path d="M14.7 15.5 17 17.8V21l-3-1.3" />
    </svg>
  );
}
