import type { ResumenEstados } from "./estado-ui.ts";

// Fila de resumen del pad: "N vivo · N en espera · N caido · N sin configurar". El numero
// va en color de la severidad, el label en muted.
export function EstadoResumen({ r }: { r: ResumenEstados }) {
  const items: { n: number; label: string; color: string }[] = [
    { n: r.vivo, label: "vivo", color: "text-done" },
    { n: r.espera, label: "en espera", color: "text-today" },
    { n: r.caido, label: "caído", color: "text-overdue" },
    { n: r.sinConfigurar, label: "sin configurar", color: "text-muted" },
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-5 border-b border-line pb-5">
      {items.map((it) => (
        <span key={it.label} className="text-sm text-muted">
          <span className={`font-semibold ${it.color}`}>{it.n}</span> {it.label}
        </span>
      ))}
    </div>
  );
}
