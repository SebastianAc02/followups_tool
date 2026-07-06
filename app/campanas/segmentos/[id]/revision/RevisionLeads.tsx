'use client';

import { useState, useTransition } from 'react';
import { excluirLeadAction, incluirLeadAction } from '../../../actions';

type Lead = {
  id: string;
  nombre: string | null;
  estado: string | null;
  categoria: string | null;
  usuarios: number | null;
  excluida: boolean;
};

type Props = { idSegmento: number; empresas: Lead[] };

export default function RevisionLeads({ idSegmento, empresas }: Props) {
  // Estado optimista: el toggle se ve al toque, la server action confirma en segundo
  // plano. Si algo falla, el revalidatePath del server component vuelve a traer la
  // verdad la proxima vez que se navega a esta pagina.
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set(empresas.filter((e) => e.excluida).map((e) => e.id)));
  const [, startTransition] = useTransition();

  function toggle(idEmpresa: string) {
    const yaExcluida = excluidas.has(idEmpresa);
    setExcluidas((prev) => {
      const next = new Set(prev);
      if (yaExcluida) next.delete(idEmpresa);
      else next.add(idEmpresa);
      return next;
    });
    startTransition(async () => {
      if (yaExcluida) await incluirLeadAction(idSegmento, idEmpresa);
      else await excluirLeadAction(idSegmento, idEmpresa);
    });
  }

  const van = empresas.length - excluidas.size;

  return (
    <div className="capture">
      <div className="section-label">
        {van} van a la campaña · {excluidas.size} no van
      </div>
      <div className="cad-list">
        {empresas.map((e) => {
          const fuera = excluidas.has(e.id);
          return (
            <div key={e.id} className="cad-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ opacity: fuera ? 0.5 : 1 }}>
                <span className="cad-item-nombre">{e.nombre}</span>
                <br />
                <span className="cad-item-meta mono">
                  {e.estado ?? 'sin estado'} · {e.categoria ?? 'sin categoria'} ·{' '}
                  {e.usuarios != null ? `${e.usuarios} usuarios` : 'sin dato'}
                </span>
              </div>
              <button type="button" className="chip" onClick={() => toggle(e.id)}>
                {fuera ? 'volver a meter' : 'esta no va'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
