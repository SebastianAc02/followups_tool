import { Pill } from '../ui/Pill';
import { CanalTag, type Canal } from '../ui/CanalTag';
import { Stat } from '../ui/Stat';

const ESTADO_TONE = {
  activa: 'hot',
  pausada: 'warm',
  borrador: 'cold',
} as const;

const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  pausada: 'Pausada',
  borrador: 'Borrador',
};

export type CampanaCardVM = {
  id: number;
  nombre: string;
  estado: string;
  segmento: string;
  descripcionSegmento: string | null;
  pasos: number;
  dias: number | null;
  canalPrincipal: string | null;
  inscritas: number;
  bloqueadas: number;
};

export function CampanaCard({ campana }: { campana: CampanaCardVM }) {
  const tone = ESTADO_TONE[campana.estado as keyof typeof ESTADO_TONE] ?? 'cold';
  const label = ESTADO_LABEL[campana.estado] ?? campana.estado;
  const meta = [
    `${campana.pasos} toques`,
    campana.dias != null ? `${campana.dias} días` : null,
    campana.descripcionSegmento ?? campana.segmento,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="rounded-2xl border border-line bg-card p-[18px] transition-all duration-150 hover:-translate-y-0.5 hover:bg-card-hover hover:shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-serif text-base tracking-tight text-ink">{campana.nombre}</span>
        <Pill tone={tone} dot>
          {label}
        </Pill>
      </div>
      <p className="mb-4 text-xs text-muted">{meta}</p>
      <div className="flex items-center justify-between">
        {campana.canalPrincipal && <CanalTag canal={campana.canalPrincipal as Canal} />}
        <div className="flex gap-4">
          <Stat value={campana.inscritas} label="inscritas" />
          <Stat value={campana.bloqueadas} label="bloq." tone={campana.bloqueadas > 0 ? 'overdue' : 'neutral'} />
        </div>
      </div>
    </article>
  );
}
