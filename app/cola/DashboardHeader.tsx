import { Stat } from "../ui/Stat";
import { formatoFechaLargaEsCo, formatoHoraEsCo, saludoPorHora } from "../lib/date-utils.ts";

const NAV_LINKS = [
  { href: "#current-follow-up", label: "Ahora" },
  { href: "#today-agenda", label: "Tu agenda de hoy" },
];

// Traduccion literal del <header> de Arc (Sales Followup Cockpit / index.html):
// sticky, eyebrow fecha+hora, saludo serif grande, stats en linea, hairline, nav.
// El switch de owners y el logout salieron de aqui (decision explicita del
// 2026-07-07: pureza visual sobre el mockup, ver memoria de sesion).
export function DashboardHeader({
  nombre,
  hoy,
  pendientes,
  vencidas,
  cerradas,
}: {
  nombre: string;
  hoy: string;
  owner: string;
  pendientes: number;
  vencidas: number;
  cerradas: number;
}) {
  const hora = new Date().getHours();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 lg:px-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-muted">
              {formatoFechaLargaEsCo(hoy)} · {formatoHoraEsCo(new Date())}
            </div>
            <h1 className="font-serif text-4xl leading-tight tracking-tight text-ink md:text-5xl">
              {saludoPorHora(hora)}, {nombre}
            </h1>
          </div>
          <div className="flex flex-row items-baseline gap-6">
            <Stat value={pendientes} label="pendientes" tone="neutral" />
            <Stat value={cerradas} label="cerradas" tone="done" />
            <Stat value={vencidas} label="vencidas" tone="overdue" />
          </div>
        </div>
        <div className="mt-5 h-px bg-line" />
        <nav className="flex items-center gap-6 pt-3 pb-1">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs uppercase tracking-widest text-muted transition-colors duration-150 hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
