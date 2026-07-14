// Panel lateral del embudo: lista las empresas de la etapa clickeada y, al elegir una,
// abre la ficha completa (reusa DetallePanel de seguimiento -- misma vista de "toda la
// historia" que ya existe ahi, no se duplica). Solo se monta cuando FunnelCanvas tiene
// una etapa elegida (ver onClose para volver al embudo de ancho completo).
'use client';

import { useEffect, useState } from 'react';
import { empresasDeEtapaAction } from '../../pipeline/actions';
import { perfilPipelineEmpresaAction, historialEtapasAction } from '../../seguimiento/actions';
import { DetallePanel, type DetallePanelData } from '../seguimiento/DetallePanel';
import type { EmpresaEnEtapa, HistorialEtapas } from '../../db/repository';

export type EtapaSeleccionada = { estado: string; label: string };

export function EtapaEmpresasPanel({
  etapa,
  owner,
  campana,
  onClose,
}: {
  etapa: EtapaSeleccionada;
  owner?: string;
  campana?: string;
  onClose: () => void;
}) {
  const [empresas, setEmpresas] = useState<EmpresaEnEtapa[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const [detalle, setDetalle] = useState<DetallePanelData | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [timelineEtapas, setTimelineEtapas] = useState<HistorialEtapas | undefined>(undefined);

  useEffect(() => {
    setBusqueda('');
    let cancelado = false;
    setCargandoLista(true);
    empresasDeEtapaAction(etapa.estado, owner, campana)
      .then((r) => {
        if (!cancelado) setEmpresas(r);
      })
      .finally(() => {
        if (!cancelado) setCargandoLista(false);
      });
    return () => {
      cancelado = true;
    };
  }, [etapa, owner, campana]);

  function abrirEmpresa(idEmpresa: string) {
    setDetalle(null);
    setTimelineEtapas(undefined);
    setDetalleOpen(true);
    setCargandoDetalle(true);
    perfilPipelineEmpresaAction(idEmpresa)
      .then((d) => setDetalle(d))
      .finally(() => setCargandoDetalle(false));
    historialEtapasAction(idEmpresa).then((t) => setTimelineEtapas(t));
  }

  const filtro = busqueda.trim().toLowerCase();
  const empresasFiltradas = filtro
    ? empresas.filter((e) => e.nombre.toLowerCase().includes(filtro))
    : empresas;

  return (
    <div className="rounded-2xl border border-line-card bg-pipeline-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="text-sm font-semibold text-ink">{etapa.label}</span>
        <div className="flex items-center gap-2">
          <span className="mono text-xs text-muted">
            {filtro ? `${empresasFiltradas.length}/${empresas.length}` : empresas.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel de cuentas"
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-ink hover:bg-white/5 transition-all"
          >
            ✕
          </button>
        </div>
      </div>

      {!cargandoLista && empresas.length > 0 && (
        <div className="px-4 py-2.5 border-b border-line">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar en ${etapa.label.toLowerCase()}...`}
            className="w-full rounded-lg border border-line-card bg-shell px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-accent"
          />
        </div>
      )}

      <div className="max-h-[520px] overflow-y-auto divide-y divide-line">
        {cargandoLista && <div className="px-4 py-4 text-sm text-muted">Cargando...</div>}
        {!cargandoLista && empresas.length === 0 && (
          <div className="px-4 py-4 text-sm text-muted">Sin cuentas en esta etapa.</div>
        )}
        {!cargandoLista && empresas.length > 0 && empresasFiltradas.length === 0 && (
          <div className="px-4 py-4 text-sm text-muted">Ninguna cuenta coincide con &quot;{busqueda}&quot;.</div>
        )}
        {!cargandoLista &&
          empresasFiltradas.map((e) => (
            <button
              key={e.idEmpresa}
              type="button"
              onClick={() => abrirEmpresa(e.idEmpresa)}
              className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <div className="text-sm font-medium text-ink">{e.nombre}</div>
              <div className="text-xs text-muted">
                {e.ciudad ?? 'Ciudad sin dato'}
                {e.owner ? ` · ${e.owner}` : ''}
              </div>
            </button>
          ))}
      </div>

      <DetallePanel
        data={detalle}
        isOpen={detalleOpen}
        cargando={cargandoDetalle}
        onClose={() => setDetalleOpen(false)}
        timelineEtapas={timelineEtapas}
      />
    </div>
  );
}
