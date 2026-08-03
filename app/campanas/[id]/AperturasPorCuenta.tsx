import type { DetalleTracking } from '../../core/resumen-tracking';
import { haceCuanto } from '../../core/resumen-tracking';
import { cn } from '../../ui/cn';

// "Cuántas veces, a qué hora, y si hubo clic" (lo que Sebastián pidió explícito, 2026-08-03).
//
// Hasta hoy esta pantalla colapsaba todo eso a un chip "Abrió", que no distingue una apertura
// de nueve, y la hora exacta no se mostraba en ningún lado: /cola dice "hace 2h" y ya. En una
// prueba, "hace 2h" no sirve para cruzar contra el momento en que uno mismo abrió el correo.
//
// La regla anti-proxy no se toca (la primera apertura no cuenta: el proxy de Gmail y la
// precarga de Apple Mail disparan el pixel sin que nadie mire), pero acá se DICE. Pintar "1
// apertura registrada" como "Sin abrir" sin explicar por qué es lo que hace pensar que el
// tracking está roto.

export type FilaAperturas = {
  idEmpresa: string;
  empresa: string;
  detalle: DetalleTracking;
};

const TONO: Record<string, string> = {
  caliente: 'text-done',
  frio: 'text-muted',
  ninguna: 'text-faint',
};

// Fecha y hora reales, en hora de Bogotá. El relativo va al lado, no en vez de.
function fechaHoraBogota(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function Marca({ label, tone = 'done' }: { label: string; tone?: 'done' | 'muted' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'done' ? 'bg-done/10 text-done' : 'bg-surface-2 text-muted',
      )}
    >
      {label}
    </span>
  );
}

export function AperturasPorCuenta({ filas, ahora }: { filas: FilaAperturas[]; ahora: Date }) {
  const conSeñal = filas.filter((f) => f.detalle.crudas > 0 || f.detalle.clics > 0 || f.detalle.vioWhatsapp);

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-line bg-card">
      <div className="border-b border-line px-5 py-4">
        <h3 className="font-serif text-lg text-ink">Aperturas por cuenta</h3>
        <p className="mt-0.5 text-[13px] text-muted">Cuántas veces, a qué hora y si hicieron clic. Solo de esta campaña.</p>
      </div>

      {conSeñal.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Todavía no hay ninguna apertura registrada en esta campaña.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-widest text-faint">
                <th className="px-5 py-3 font-normal">Cuenta</th>
                <th className="px-5 py-3 font-normal">Aperturas</th>
                <th className="px-5 py-3 font-normal">Última</th>
                <th className="px-5 py-3 font-normal">Señales</th>
              </tr>
            </thead>
            <tbody>
              {conSeñal.map((f) => {
                const d = f.detalle;
                return (
                  <tr key={f.idEmpresa} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3.5 font-semibold text-ink">{f.empresa}</td>
                    <td className={cn('px-5 py-3.5', TONO[d.temperatura] ?? 'text-muted')}>
                      {d.reales > 0 ? (
                        <span className="font-semibold">
                          {d.reales} {d.reales === 1 ? 'vez' : 'veces'}
                        </span>
                      ) : (
                        <span className="text-muted">Sin apertura confirmada</span>
                      )}
                      <span className="ml-2 text-[11.5px] text-faint">
                        {d.crudas} registrada{d.crudas === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono-tag text-xs text-muted">
                      {d.ultimaApertura ? (
                        <>
                          {fechaHoraBogota(d.ultimaApertura)}
                          <span className="ml-2 text-faint">{haceCuanto(d.ultimaApertura, ahora)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {d.clics > 0 && <Marca label={d.clics === 1 ? 'Clic' : `${d.clics} clics`} />}
                        {d.vioWhatsapp && <Marca label="Vio el WhatsApp" />}
                        {/* Lo que antes se leía como "Sin abrir" y no lo era. */}
                        {d.soloProxy && <Marca label="1 apertura descartada" tone="muted" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-line px-5 py-3 text-[11px] text-faint">
        La primera apertura de cada correo no se cuenta: el proxy de Gmail y la precarga de Apple Mail disparan el
        pixel sin que nadie lo lea. Por eso una cuenta puede tener una apertura registrada y cero confirmadas. Las
        horas son de Bogotá.
      </p>
    </div>
  );
}
