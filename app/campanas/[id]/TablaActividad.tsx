import type { FilaActividad } from '../../db/repository';
import { CanalTag, type Canal } from '../../ui/CanalTag';
import { cn } from '../../ui/cn';

// "Que se mando y que paso con cada cosa" (Sebastian lo pidio 3 veces, 2026-07-15). Los
// datos ya existian -- evento_tracking guarda los 6 tipos desde el pixel, el poll de
// Apollo/Gmail y el webhook de Evolution -- pero nadie los leia. Esto es la lectura.
//
// Version minima a proposito: una fila por envio, las señales como chips. El panel bueno
// (agregados, por campaña, filtros) es otra conversacion.

const ESTADO: Record<string, { label: string; className: string }> = {
  enviada: { label: 'Enviado', className: 'bg-done/10 text-done' },
  pendiente: { label: 'Pendiente', className: 'bg-today/10 text-today' },
  fallo: { label: 'Falló', className: 'bg-overdue/10 text-overdue' },
  omitida: { label: 'Omitido', className: 'text-faint' },
  enviando: { label: 'Enviando…', className: 'bg-today/10 text-today' },
};

function Señal({ label, tone }: { label: string; tone: 'done' | 'today' | 'overdue' }) {
  const clases = {
    done: 'bg-done/10 text-done',
    today: 'bg-today/10 text-today',
    overdue: 'bg-overdue/10 text-overdue',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', clases[tone])}>{label}</span>;
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function TablaActividad({ filas }: { filas: FilaActividad[] }) {
  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-line bg-card">
      <div className="border-b border-line px-5 py-4">
        <h3 className="font-serif text-lg text-ink">Actividad</h3>
        <p className="mt-0.5 text-[13px] text-muted">Qué salió, quién lo abrió y quién respondió.</p>
      </div>

      {filas.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Todavía no se ha enviado ningún toque de esta campaña.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-widest text-faint">
                <th className="px-5 py-3 font-normal">Paso</th>
                <th className="px-5 py-3 font-normal">Contacto</th>
                <th className="px-5 py-3 font-normal">Canal</th>
                <th className="px-5 py-3 font-normal">Estado</th>
                <th className="px-5 py-3 font-normal">Fecha</th>
                <th className="px-5 py-3 font-normal">Señales</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const est = ESTADO[f.estado] ?? { label: f.estado, className: 'text-faint' };
                const sinSeñales = !f.abrio && !f.hizoClic && !f.vioWhatsapp && !f.respondio && !f.reboto;
                return (
                  <tr key={f.idPasoInscripcion} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3.5 font-mono-tag text-xs text-muted">{f.orden}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-ink">{f.contacto ?? '—'}</div>
                      <div className="text-xs text-muted">{f.empresa}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <CanalTag canal={f.canal as Canal} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', est.className)}>
                        {est.label}
                      </span>
                      {f.proveedor && <span className="ml-2 text-[11px] text-faint">{f.proveedor}</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono-tag text-xs text-muted">{fechaCorta(f.fecha)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {f.abrio && <Señal label="Abrió" tone="done" />}
                        {f.hizoClic && <Señal label="Clic" tone="done" />}
                        {f.vioWhatsapp && <Señal label="Visto" tone="done" />}
                        {f.respondio && <Señal label="Respondió" tone="done" />}
                        {f.reboto && <Señal label="Rebotó" tone="overdue" />}
                        {sinSeñales && <span className="text-xs text-faint">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* El "visto" de WhatsApp depende de que la persona tenga las confirmaciones de lectura
          prendidas; si las tiene apagadas, el evento nunca llega. Decirlo evita leer un
          "sin señales" como "no lo vio". */}
      <p className="border-t border-line px-5 py-3 text-[11px] text-faint">
        Las aperturas de correo se detectan con un pixel: un cliente que bloquea imágenes no las
        reporta. El visto de WhatsApp solo llega si la persona tiene activas las confirmaciones de
        lectura. Sin señal no significa que no lo vio.
      </p>
    </div>
  );
}
