import Link from 'next/link';

export type FilaSeccion = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto?: string | null;
  cargo?: string | null;
  estado?: string | null;
  fecha?: string | null;
  campana?: string | null;
};

// Las secciones de /cola que NO son el trabajo de hoy (2026-08-03): "sin proximo paso
// decidido", "programadas" y "en hold". Existen para que sacar algo del contador no sea
// esconderlo: cada cosa que se cae de la cola del dia cae en una de estas listas, con el
// motivo escrito en el subtitulo.
//
// Van fuera del contador a proposito. El numero de arriba es el trabajo de hoy y tiene que
// poder llegar a cero; estas listas no bajan solas y por eso no pueden sumar ahi.
export function SeccionFueraDeHoy({
  titulo,
  descripcion,
  filas,
  conAcciones = true,
  accionExtra,
}: {
  titulo: string;
  descripcion: string;
  filas: FilaSeccion[];
  conAcciones?: boolean;
  accionExtra?: { href: string; label: string };
}) {
  if (filas.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg text-ink">
            {titulo} <span className="text-muted">· {filas.length}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted">{descripcion}</p>
        </div>
        {accionExtra && (
          <Link
            href={accionExtra.href}
            className="flex-none rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
          >
            {accionExtra.label}
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-line-card bg-card">
        <ul className="divide-y divide-line">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <Link href={`/llamada/${f.id}`} className="truncate text-[13.5px] font-medium text-ink hover:text-acento">
                  {f.empresa}
                </Link>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {[f.ciudad, f.contacto, f.cargo, f.campana, f.fecha].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </div>
              </div>
              {conAcciones && (
                <div className="flex flex-none items-center gap-2">
                  {(['llamada', 'whatsapp', 'correo'] as const).map((vista) => (
                    <Link
                      key={vista}
                      href={`/llamada/${f.id}?vista=${vista}`}
                      className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
                    >
                      {vista === 'llamada' ? 'Llamar' : vista === 'whatsapp' ? 'WhatsApp' : 'Correo'}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default SeccionFueraDeHoy;
