import { Pill } from '../ui/Pill';
import { CanalTag, type Canal } from '../ui/CanalTag';
import { SectionLabel } from '../ui/SectionLabel';
import { BotonSacar } from './BotonSacar';

export type InscritaHubVM = {
  id: number;
  empresa: string;
  campana?: string;
  estado: string;
  canalPrincipal: string | null;
  ultimoToque: string | null;
};

// Mismo shape que aperturasPorCampana() en db/repository.ts. Tipo duplicado (no
// importado desde ahi) para no acoplar InscritasTable al modulo del repository --
// esta tabla ya es puramente de presentacion.
export type AperturaVM = { idInscripcion: number; abrio: boolean; hizoClic: boolean; vioWhatsapp: boolean };

const ESTADO_TONE = {
  activa: 'hot',
  bloqueada: 'cold',
} as const;

const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  bloqueada: 'Bloqueada · cola de revisión',
};

function formatoFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

// mostrarCampana en false cuando ya estamos dentro de UNA campana (Destinatarios):
// ahi la columna es redundante, todas las filas son la misma campana.
//
// idCampana solo llega desde Destinatarios (la unica pantalla donde "sacar" tiene
// sentido: ahi la inscripcion ya es real, no un preview de usar-y-tirar). Sin idCampana
// (el hub general de Campanas) no se renderiza el boton -- BotonSacar necesita saber a
// que campana volver despues de revalidar.
export function InscritasTable({
  inscritas,
  mostrarCampana = true,
  idCampana,
  aperturas,
}: {
  inscritas: InscritaHubVM[];
  mostrarCampana?: boolean;
  idCampana?: number;
  aperturas?: AperturaVM[];
}) {
  const aperturaPorInscripcion = new Map((aperturas ?? []).map((a) => [a.idInscripcion, a]));
  return (
    <div className="mt-8">
      <SectionLabel className="mb-3">Empresas inscritas</SectionLabel>
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        {inscritas.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted">Sin empresas inscritas todavía.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-widest text-faint">
                <th className="px-5 py-3 font-normal">Empresa</th>
                {mostrarCampana && <th className="px-5 py-3 font-normal">Campaña</th>}
                <th className="px-5 py-3 font-normal">Canal</th>
                <th className="px-5 py-3 font-normal">Último toque</th>
                <th className="px-5 py-3 font-normal">Estado</th>
                {aperturas != null && <th className="px-5 py-3 font-normal">Visto</th>}
                {idCampana != null && <th className="px-5 py-3 font-normal"></th>}
              </tr>
            </thead>
            <tbody>
              {inscritas.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="px-5 py-3.5 font-semibold text-ink">{f.empresa}</td>
                  {mostrarCampana && <td className="px-5 py-3.5 text-ink-soft">{f.campana}</td>}
                  <td className="px-5 py-3.5">
                    {f.canalPrincipal && <CanalTag canal={f.canalPrincipal as Canal} />}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">{formatoFecha(f.ultimoToque)}</td>
                  <td className="px-5 py-3.5">
                    <Pill tone={ESTADO_TONE[f.estado as keyof typeof ESTADO_TONE] ?? 'cold'} dot>
                      {ESTADO_LABEL[f.estado] ?? f.estado}
                    </Pill>
                  </td>
                  {aperturas != null && (
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1.5">
                        {aperturaPorInscripcion.get(f.id)?.abrio && (
                          <Pill tone="hot">Abrió</Pill>
                        )}
                        {aperturaPorInscripcion.get(f.id)?.hizoClic && (
                          <Pill tone="hot">Clic</Pill>
                        )}
                        {aperturaPorInscripcion.get(f.id)?.vioWhatsapp && (
                          <Pill tone="hot">Vio WhatsApp</Pill>
                        )}
                        {!aperturaPorInscripcion.get(f.id) && <span className="text-faint">—</span>}
                      </div>
                    </td>
                  )}
                  {idCampana != null && (
                    <td className="px-5 py-3.5">
                      {f.estado === 'activa' && <BotonSacar idInscripcion={f.id} idCampana={idCampana} />}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
