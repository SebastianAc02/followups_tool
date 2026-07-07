'use client';

import { useState } from 'react';
import { aprobarDesdeInboxAction } from './actions';
import { cn } from '../ui/cn';
import { CanalTag, type Canal } from '../ui/CanalTag';
import { button } from '../ui/button.variants.ts';

export type ItemPorRevisar = {
  idPasoInscripcion: number;
  fechaProgramada: string | null;
  email: string | null;
  nombre: string | null;
  asunto: string | null;
  cuerpo: string | null;
  canal: string;
  idEmpresa: string;
  empresaNombre: string;
};

function canalNormalizado(canal: string | null | undefined): Canal {
  return canal === 'whatsapp' || canal === 'correo' ? canal : 'llamada';
}

// Mismo patron de resaltado que conVariablesResaltadas en app/cola/CadenciasHoy.tsx
// (copiado a proposito, no importado desde ahi -- esta ruta no depende de /cola).
// pasosManualesPendientes() no trae datos de personalizacion resueltos (V5.6 solo
// junta email/nombre/asunto/cuerpo crudos de version_paso), asi que el cuerpo puede
// traer placeholders [nombre] sin resolver. Forzar renderizarCopy() sin datos reales
// solo mostraria "faltantes" en todos lados; resaltar visualmente el placeholder tal
// cual esta es mas honesto con lo que el usuario va a mandar si no lo edita.
function conVariablesResaltadas(texto: string) {
  const partes = texto.split(/(\[[^[\]]+\])/g);
  return partes.map((p, i) =>
    /^\[[^[\]]+\]$/.test(p) ? (
      <mark key={i} className="rounded-[4px] bg-today-bg px-1 text-today">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function ToqueRevisar({ item }: { item: ItemPorRevisar }) {
  const tieneCopy = item.canal !== 'llamada' && item.cuerpo != null;
  const [cuerpo, setCuerpo] = useState(item.cuerpo ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aprobado, setAprobado] = useState(false);

  if (aprobado) return null;

  async function aprobar() {
    setEnviando(true);
    setError(null);
    const resultado = await aprobarDesdeInboxAction(item.idPasoInscripcion, tieneCopy ? cuerpo : undefined);
    if (resultado.ok) {
      setAprobado(true);
    } else {
      setError(resultado.error);
      setEnviando(false);
    }
  }

  return (
    <div className="border-b border-line py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{item.empresaNombre}</span>
        <CanalTag canal={canalNormalizado(item.canal)} />
        {item.nombre && <span className="text-[13px] text-muted">{item.nombre}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>
          contacto <b className="text-ink-soft">{item.email ?? '—'}</b>
        </span>
        {item.asunto && (
          <span>
            asunto <b className="text-ink-soft">{item.asunto}</b>
          </span>
        )}
        {item.fechaProgramada && (
          <span className="mono text-faint">programado {item.fechaProgramada.slice(0, 10)}</span>
        )}
      </div>

      {tieneCopy && (
        <div className="my-2">
          <div className="mb-1.5 text-[13px] leading-[1.5] text-ink-soft">
            {conVariablesResaltadas(item.cuerpo!)}
          </div>
          <textarea
            rows={4}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Personaliza antes de mandarlo..."
            className="w-full rounded-[10px] border border-line bg-hover px-3 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
          />
        </div>
      )}

      {error && <p className="mt-1.5 text-[12.5px] text-overdue">{error}</p>}

      <button
        type="button"
        onClick={aprobar}
        disabled={enviando}
        className={cn(button({ variant: 'pill' }), 'mt-2 text-[12.5px]')}
      >
        {enviando ? 'Aprobando...' : 'Aprobar y programar'}
      </button>
    </div>
  );
}
