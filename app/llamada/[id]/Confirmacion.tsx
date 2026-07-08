import Link from "next/link";
import BuscarGrabacion from "./BuscarGrabacion";

// Receipt post-submit: solo LEE lo que registrarToqueAction ya guardo (outbox/Notion
// siguen su flujo propio, esto no dispara ningun sync nuevo). Ver mockup de referencia
// "Check Received Confirmation Touch" -- misma estructura (header de exito + grid de
// 3 columnas + footer), tokens del proyecto en vez de los colores crudos del mockup.

export type CampoConfirmacion = { label: string; valor: string };

export function Confirmacion({
  idEmpresa,
  idToque,
  empresa,
  dia,
  duracion,
  campos,
  resumenDictado,
  granola,
  sincronizado,
}: {
  idEmpresa: string;
  idToque: number;
  empresa: string;
  dia: number | null;
  duracion: string | null;
  campos: CampoConfirmacion[];
  resumenDictado: string;
  granola: { resumen: string | null; url: string | null };
  sincronizado: { notion: boolean; granola: boolean };
}) {
  const sub = [empresa, dia != null ? `día ${dia}` : null, duracion].filter(Boolean).join(" · ");

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-shell">
      {/* Header de exito */}
      <div className="flex items-center gap-3 border-b border-line bg-accent-whatsapp-soft px-5 py-3.5">
        <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-accent-whatsapp-soft">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent-whatsapp" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div className="flex-1">
          <div className="font-toque-heading text-[15px] font-semibold leading-tight text-ink">Toque guardado y enlazado</div>
          <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>
        </div>
        <div className="flex gap-2">
          <SincronizadoChip label="Notion" ok={sincronizado.notion} />
          <SincronizadoChip label="Granola" ok={sincronizado.granola} />
        </div>
      </div>

      {/* Grid de 3 columnas */}
      <div className="grid grid-cols-1 md:grid-cols-3">
        {/* Col 1: campos que llenaste */}
        <div className="border-b border-line p-4 md:border-b-0 md:border-r">
          <div className="mb-3 font-toque-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
            Campos que llenaste
          </div>
          <div className="flex flex-col gap-2.5 text-[12.5px]">
            {campos.map((c, i) => {
              const esResultado = c.label === "Resultado";
              return (
                <div
                  key={`${c.label}-${i}`}
                  className={`flex justify-between ${esResultado ? "border-t border-line pt-2" : ""}`}
                >
                  <span className="text-muted">{c.label}</span>
                  <span className={`font-toque-mono font-semibold ${esResultado ? "text-check" : "text-ink"}`}>
                    {c.valor}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 2: resumen dictado */}
        <div className="border-b border-line p-4 md:border-b-0 md:border-r">
          <div className="mb-3 font-toque-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent-llamada">
            Tu resumen · dictado
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-soft">{resumenDictado}</p>
        </div>

        {/* Col 3: granola */}
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-toque-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
              Granola
            </span>
            <span className="font-toque-mono text-[9px] font-semibold text-check">¿el correcto?</span>
          </div>
          {granola.resumen ? (
            <>
              <div className="rounded-lg border border-line bg-surface p-3">
                <p className="text-[11px] italic leading-relaxed text-muted">&ldquo;{granola.resumen}&rdquo;</p>
              </div>
              {granola.url && (
                <a
                  href={granola.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-block font-toque-mono text-[10px] font-semibold text-accent-correo hover:opacity-80"
                >
                  Abrir grabación en Granola
                </a>
              )}
            </>
          ) : (
            <BuscarGrabacion idEmpresa={idEmpresa} idToque={idToque} />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Link
          href={`/llamada/${idEmpresa}`}
          className="rounded-[8px] border border-line-strong bg-surface px-[15px] py-2 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface-2"
        >
          Ver toque
        </Link>
        <Link
          href="/cola"
          className="rounded-[8px] bg-accent-llamada px-[18px] py-2 text-[12.5px] font-semibold text-ink transition-colors hover:opacity-90"
        >
          Volver a la cola
        </Link>
      </div>
    </div>
  );
}

function SincronizadoChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-shell-2 px-2.5 py-[5px] font-toque-mono text-[10px] font-semibold text-ink-soft">
      <span className={`h-[5px] w-[5px] flex-none rounded-full ${ok ? "bg-accent-whatsapp" : "bg-faint"}`} aria-hidden="true" />
      <span className={ok ? "text-check" : undefined}>{label}</span>
    </span>
  );
}

export default Confirmacion;
