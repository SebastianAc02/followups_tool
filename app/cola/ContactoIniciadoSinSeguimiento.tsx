import Link from "next/link";

type FilaSinSeguimiento = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto: string | null;
  cargo: string | null;
};

// Seccion "Contacto iniciado sin seguimiento" (2026-07-14): visible para CUALQUIER owner
// (a diferencia del resto de /cola, que gatea el split por OWNER_COLA_SPLIT). Cada fila
// trae 3 acciones a los 3 canales -- decidirVista (ToqueContexto.ts) ya sabe respetar el
// ?vista= explicito de estos links cuando no hay cadencia activa empujando otro canal.
export function ContactoIniciadoSinSeguimiento({ filas, owner }: { filas: FilaSinSeguimiento[]; owner: string }) {
  if (filas.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-serif text-lg text-ink">Contacto iniciado sin seguimiento</h3>
          <p className="mt-0.5 text-xs text-muted">Se les habló, pero no quedaron en ninguna cadencia ni con fecha de vuelta.</p>
        </div>
        <Link
          href={`/campanas/nueva?estado=contacto_iniciado&owner=${encodeURIComponent(owner)}`}
          className="flex-none rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
        >
          Promover a campaña
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-line-card bg-card">
        <ul className="divide-y divide-line">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-ink">{f.empresa}</div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {[f.ciudad, f.contacto, f.cargo].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                <Link
                  href={`/llamada/${f.id}?vista=llamada`}
                  className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
                >
                  Llamar
                </Link>
                <Link
                  href={`/llamada/${f.id}?vista=whatsapp`}
                  className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
                >
                  WhatsApp
                </Link>
                <Link
                  href={`/llamada/${f.id}?vista=correo`}
                  className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
                >
                  Correo
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ContactoIniciadoSinSeguimiento;
