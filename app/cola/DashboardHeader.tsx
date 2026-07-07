import Link from "next/link";
import { cn } from "../ui/cn";
import { Stat } from "../ui/Stat";
import { chip } from "../ui/chip.variants.ts";
import { formatoFechaLargaEsCo, saludoPorHora } from "../lib/date-utils.ts";

const OWNERS = [
  { key: "Sebastian Acosta Molina", label: "Sebastián" },
  { key: "Felipe Castro", label: "Felipe" },
  { key: "Thomas Schumacher", label: "Thomas" },
];

export function DashboardHeader({
  nombre,
  hoy,
  owner,
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
    <div className="mb-8 flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
      <div>
        <div className="font-serif text-[28px] font-medium tracking-[-0.01em] text-ink">
          {saludoPorHora(hora)}, {nombre}
        </div>
        <div className="mt-1 text-[13px] text-muted">{formatoFechaLargaEsCo(hoy)}</div>
        <div className="mt-4 flex gap-1.5">
          {OWNERS.map((o) => (
            <Link
              key={o.key}
              href={`/cola?owner=${encodeURIComponent(o.key)}`}
              className={cn(chip({ on: o.key === owner }), "inline-block")}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex gap-8 max-sm:w-full max-sm:justify-between max-sm:gap-4">
        <Stat value={pendientes} label="pendientes" tone="neutral" />
        <Stat value={vencidas} label="vencidas" tone="overdue" />
        <Stat value={cerradas} label="cerradas" tone="done" />
      </div>
    </div>
  );
}
