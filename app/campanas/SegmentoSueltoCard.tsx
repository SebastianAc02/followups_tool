import Link from 'next/link';
import { Pill } from '../ui/Pill';

export type SegmentoSueltoVM = {
  id: number;
  nombre: string;
  descripcionNatural: string | null;
};

// Un segmento que el autosave de NuevoSegmento ya guardo, pero al que todavia
// ninguna campana referencia (campana.id_cadencia es NOT NULL -- no hay fila
// 'borrador' hasta que se pega la cadencia, ver segmentosSinCampana en el
// repository). Borde punteado a proposito, igual que "+ Nueva campana": comunica
// "esto no es una campana todavia" sin inventar un estado falso en la base.
export function SegmentoSueltoCard({ segmento }: { segmento: SegmentoSueltoVM }) {
  return (
    <Link
      href={`/campanas/nueva?segmento=${segmento.id}`}
      className="block rounded-2xl border border-dashed border-line-strong bg-card/40 p-[18px] transition-all duration-150 hover:-translate-y-0.5 hover:bg-card-hover hover:shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="max-w-[80%] truncate font-serif text-base tracking-tight text-ink-soft">{segmento.nombre}</span>
        <Pill tone="cold" dot>
          Sin cadencia
        </Pill>
      </div>
      <p className="mb-1 text-xs text-muted">{segmento.descripcionNatural ?? 'Segmento guardado, todavía sin cadencia.'}</p>
      <p className="text-xs font-semibold text-accent-soft">Continuar →</p>
    </Link>
  );
}
