// Íconos del sidebar (rediseño home). SVG stroke, heredan color por `currentColor`.
// Tamaño y color se controlan con clases Tailwind desde el consumidor.

type IconProps = { className?: string };

function base(className?: string) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: className ?? 'h-[17px] w-[17px]',
  };
}

export function IconInicio({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </svg>
  );
}

export function IconCampanas({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

export function IconToques({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
    </svg>
  );
}

export function IconPipeline({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
    </svg>
  );
}

export function IconConectores({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 7 6 10a4 4 0 0 0 5.7 5.7M15 17l3-3a4 4 0 0 0-5.7-5.7" />
      <path d="M9 15l6-6" />
    </svg>
  );
}
