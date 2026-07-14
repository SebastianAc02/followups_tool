// Shell del pipeline: integra filtros laterales + tabs de navegación + detalle panel
// Se renderiza DENTRO de AppShell (no lo reemplaza). El sidebar global de AppShell
// permanece; este componente agrega filtros + tabs específicos del pipeline.
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '../cn';
import { DetallePanel, type DetallePanelData } from './DetallePanel';
import { perfilPipelineEmpresaAction, historialEtapasAction } from '../../pipeline/actions';
import type { HistorialEtapas } from '../../db/repository';

export type PipelineTab = 'overview' | 'embudo' | 'reportes' | 'ajustes';

// Decisión: usar URL searchParams para los tabs (persist entre navegaciones) y estado
// local para la ficha de detalle (UI transitoria). La ficha YA NO llega por props
// precargada -- se pide bajo demanda via server action al abrir una fila (idEmpresa va
// en data-empresa-id, ver EmpresaRow), asi no se trae la ficha completa (contactos +
// historial + timeline) de las 40+ filas visibles si nadie las abre.

export function PipelineShell({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') as PipelineTab) || 'overview';
  const [detalle, setDetalle] = useState<DetallePanelData | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [timelineEtapas, setTimelineEtapas] = useState<HistorialEtapas | undefined>(undefined);

  const handleSelectEmpresa = (idEmpresa: string) => {
    setDetalle(null);
    setTimelineEtapas(undefined);
    setDetalleOpen(true);
    setCargando(true);
    perfilPipelineEmpresaAction(idEmpresa)
      .then((d) => setDetalle(d))
      .finally(() => setCargando(false));
    // Timeline de etapas en paralelo: no bloquea la ficha principal, se pinta cuando llega.
    historialEtapasAction(idEmpresa).then((t) => setTimelineEtapas(t));
  };

  const currentDetailData = detalle;

  return (
    <>
      {/* Top section: heading + tabs */}
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink font-bold">Seguimiento global</h2>
            <p className="mt-1 text-sm text-muted">Operaciones comerciales unificadas.</p>
          </div>

          {/* Tab navigation */}
          <nav className="flex items-center gap-2" role="tablist">
            {['overview', 'embudo', 'reportes', 'ajustes'].map((t) => (
              <a
                key={t}
                href={`?tab=${t}`}
                role="tab"
                aria-selected={tab === t}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150',
                  tab === t ? 'bg-accent text-shell' : 'text-muted hover:text-ink hover:bg-white/5'
                )}
              >
                {t === 'overview' && 'Seguimiento'}
                {t === 'embudo' && 'Embudo'}
                {t === 'reportes' && 'Reportes'}
                {t === 'ajustes' && 'Ajustes'}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {/* Contenido principal */}
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('article')) {
            const article = (e.target as HTMLElement).closest('article') as HTMLElement;
            const empresaId = article.getAttribute('data-empresa-id');
            if (empresaId) {
              handleSelectEmpresa(empresaId);
            }
          }
        }}
      >
        {children}
      </div>

      {/* Ficha completa de la empresa */}
      <DetallePanel
        data={currentDetailData}
        isOpen={detalleOpen}
        cargando={cargando}
        onClose={() => setDetalleOpen(false)}
        timelineEtapas={timelineEtapas}
      />
    </>
  );
}
