import { Pill } from '../ui/Pill';
import { CanalTag, type Canal } from '../ui/CanalTag';
import { SectionLabel } from '../ui/SectionLabel';

export type InscritaHubVM = {
  id: number;
  empresa: string;
  campana: string;
  estado: string;
  canalPrincipal: string | null;
  ultimoToque: string | null;
};

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

export function InscritasTable({ inscritas }: { inscritas: InscritaHubVM[] }) {
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
                <th className="px-5 py-3 font-normal">Campaña</th>
                <th className="px-5 py-3 font-normal">Canal</th>
                <th className="px-5 py-3 font-normal">Último toque</th>
                <th className="px-5 py-3 font-normal">Estado</th>
              </tr>
            </thead>
            <tbody>
              {inscritas.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="px-5 py-3.5 font-semibold text-ink">{f.empresa}</td>
                  <td className="px-5 py-3.5 text-ink-soft">{f.campana}</td>
                  <td className="px-5 py-3.5">
                    {f.canalPrincipal && <CanalTag canal={f.canalPrincipal as Canal} />}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">{formatoFecha(f.ultimoToque)}</td>
                  <td className="px-5 py-3.5">
                    <Pill tone={ESTADO_TONE[f.estado as keyof typeof ESTADO_TONE] ?? 'cold'} dot>
                      {ESTADO_LABEL[f.estado] ?? f.estado}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
