// Ficha completa de una empresa desde el Pipeline: todos los contactos, la secuencia
// de la cadencia activa (timeline hecho/activo/pendiente) y TODO el historial real de
// toques -- pedido de Sebastian (2026-07-10): "todo, todo, todo", no un resumen.
// Modal centrado (no un drawer angosto): esta vista es de lectura completa, necesita
// mas ancho que 384px para no amontonar contactos + timeline + historial.
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';
import { CanalTag, type Canal } from '../CanalTag';
import { FUNNEL_ETAPAS, ETAPA_GANADA, ETAPA_ONHOLD } from '../../db/funnel';
import type { HistorialEtapas } from '../../db/repository';

const MS_POR_DIA = 1000 * 60 * 60 * 24;

function labelEtapa(estado: string): string {
  return FUNNEL_ETAPAS.find((e) => e.estado === estado)?.label ?? estado;
}

function colorEtapa(estado: string): string {
  return FUNNEL_ETAPAS.find((e) => e.estado === estado)?.colorClass ?? 'bg-line-strong';
}

// Mismo token de color que el dot, pero como utilidad de texto -- swap de prefijo, no
// un color nuevo (single source of truth sigue siendo FUNNEL_ETAPAS.colorClass).
function colorEtapaTexto(estado: string): string {
  return colorEtapa(estado).replace(/^bg-/, 'text-');
}

// Valor CSS crudo (para la linea degradada del timeline, unico lugar donde un color
// necesita ser un string de `background: linear-gradient(...)`, no una clase Tailwind).
function colorEtapaCss(estado: string): string {
  const clase = colorEtapa(estado);
  const hex = clase.match(/^bg-\[(#[0-9a-fA-F]{3,8})\]$/)?.[1];
  if (hex) return hex;
  if (clase === 'bg-accent-soft') return 'var(--color-accent-soft)';
  return 'var(--color-line-strong)';
}

export interface ContactoCompleto {
  nombre: string | null;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  esPrincipal: boolean;
}

export interface ToqueReal {
  idToque: number;
  fecha: string | null;
  canal: Canal;
  resultado: string | null;
  quePaso: string | null;
}

export interface PasoTimeline {
  orden: number;
  diaOffset: number;
  canal: Canal;
  objetivo: string | null;
  estado: 'hecho' | 'activo' | 'pendiente';
}

export interface DetallePanelData {
  empresa: string;
  ciudad: string | null;
  categoria: string | null;
  campana: string | null;
  contactos: ContactoCompleto[];
  toques: ToqueReal[];
  secuencia: PasoTimeline[];
  proximoToque?: {
    fecha: string | null;
    canal: Canal;
    paso: string;
  };
}

function EstadoPasoDot({ estado }: { estado: PasoTimeline['estado'] }) {
  return (
    <span
      className={cn(
        'w-2.5 h-2.5 rounded-full flex-shrink-0',
        estado === 'hecho' && 'bg-green',
        estado === 'activo' && 'bg-amber-400 shadow-[0_0_0_3px_rgba(242,183,56,0.22)]',
        estado === 'pendiente' && 'bg-line-strong'
      )}
      aria-hidden="true"
    />
  );
}

export function DetallePanel({
  data,
  isOpen,
  cargando,
  onClose,
  timelineEtapas,
}: {
  data: DetallePanelData | null;
  isOpen: boolean;
  cargando?: boolean;
  onClose: () => void;
  timelineEtapas?: HistorialEtapas;
}) {
  // Portal a document.body: el wrapper de contenido de AppShell es `relative z-[1]`,
  // lo que crea su propio stacking context -- un modal `fixed` renderizado adentro
  // queda atrapado ahi y el TopBar (z-10, hermano de ese wrapper) se pinta ENCIMA del
  // modal aunque el modal tenga z-50. El portal escapa ese arbol por completo.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  if (!isOpen || !montado) return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10 px-4">
        <div className="w-full max-w-3xl bg-shell border border-line-card rounded-2xl shadow-2xl">
          {cargando && !data && <div className="px-6 py-10 text-sm text-muted text-center">Cargando ficha...</div>}

          {!cargando && !data && (
            <div className="px-6 py-10 text-sm text-muted text-center">No se pudo cargar esta empresa.</div>
          )}

          {data && (
            <>
              {/* Header */}
              <div className="sticky top-0 z-10 bg-shell border-b border-line-card px-6 py-4 flex items-center justify-between gap-4 rounded-t-2xl">
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-xl font-semibold text-ink truncate">{data.empresa}</h3>
                  <p className="text-xs text-muted truncate">
                    {[data.ciudad, data.categoria, data.campana].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-white/5 transition-all"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              {/* Contenido */}
              <div className="px-6 py-4 space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Próximo toque */}
                {data.proximoToque && (
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Próximo toque</h4>
                    <div className="bg-pipeline-card border border-line-card rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-soft">{data.proximoToque.fecha ?? 'Sin fecha programada'}</span>
                        <CanalTag canal={data.proximoToque.canal} />
                      </div>
                      <div className="text-xs text-muted">{data.proximoToque.paso}</div>
                    </div>
                  </section>
                )}

                {/* Contactos */}
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                    Contactos ({data.contactos.length})
                  </h4>
                  {data.contactos.length === 0 ? (
                    <p className="text-xs text-muted">Sin contactos registrados.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {data.contactos.map((c, i) => (
                        <div key={i} className="bg-pipeline-card border border-line-card rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-ink truncate">{c.nombre ?? 'Sin nombre'}</span>
                            {c.esPrincipal && (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-accent">Principal</span>
                            )}
                          </div>
                          <div className="text-xs text-muted truncate">{c.cargo ?? 'Sin cargo'}</div>
                          <div className="text-xs text-ink-soft truncate mt-1">{c.telefono ?? 'Sin teléfono'}</div>
                          <div className="text-xs text-ink-soft truncate">{c.email ?? 'Sin correo'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Secuencia (timeline de la cadencia activa) */}
                {data.secuencia.length > 0 && (
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                      Secuencia de la cadencia
                    </h4>
                    <div className="space-y-2">
                      {data.secuencia.map((p) => (
                        <div
                          key={p.orden}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 border',
                            p.estado === 'activo' ? 'bg-pipeline-card-today border-amber-400/30' : 'bg-transparent border-line-card'
                          )}
                        >
                          <EstadoPasoDot estado={p.estado} />
                          <span className="text-xs text-muted w-20 flex-shrink-0">Día {p.diaOffset}</span>
                          <CanalTag canal={p.canal} className="flex-shrink-0" />
                          <span className="text-xs text-ink-soft truncate flex-1">{p.objetivo ?? `Paso ${p.orden}`}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Recorrido por etapas (timeline de empresa_estado_historial) */}
                {timelineEtapas && (
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                      Recorrido por etapas
                    </h4>
                    {timelineEtapas.transiciones.length === 0 ? (
                      <div className="space-y-2">
                        {timelineEtapas.etapaActual && (
                          <div className="flex items-center gap-3 rounded-lg px-3 py-2 border border-line-card bg-pipeline-card">
                            <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', colorEtapa(timelineEtapas.etapaActual))} aria-hidden="true" />
                            <span className="text-xs text-ink-soft">{labelEtapa(timelineEtapas.etapaActual)}</span>
                          </div>
                        )}
                        <p className="text-xs text-muted">Sin transiciones registradas aún.</p>
                      </div>
                    ) : (
                      <div className="relative pl-1">
                        {/* Linea degradada conectando todos los nodos -- igual al mockup original
                            (index.html del pipeline): un solo trazo que atraviesa el timeline en
                            vez de un borde recto por nodo. */}
                        <div
                          className="absolute left-[9px] top-1.5 bottom-2.5 w-0.5 rounded-full"
                          style={{
                            background: `linear-gradient(${timelineEtapas.transiciones.map((t) => colorEtapaCss(t.estado)).join(', ')})`,
                          }}
                          aria-hidden="true"
                        />
                        {timelineEtapas.transiciones.map((t, i) => {
                          const primero = timelineEtapas.transiciones[0];
                          const siguiente = timelineEtapas.transiciones[i + 1];
                          const esUltimo = !siguiente;
                          const esCierre = esUltimo && (t.estado === ETAPA_GANADA || t.estado === ETAPA_ONHOLD);

                          const desde = new Date(t.fecha).getTime();
                          const hasta = siguiente ? new Date(siguiente.fecha).getTime() : Date.now();
                          const dias = Math.round((hasta - desde) / MS_POR_DIA);
                          const diasCiclo = Math.round((desde - new Date(primero.fecha).getTime()) / MS_POR_DIA);

                          return (
                            <div key={`${t.estado}-${t.fecha}-${i}`} className="relative pb-4 pl-7 last:pb-0">
                              <span
                                className={cn(
                                  'absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full border-2 border-shell flex-shrink-0',
                                  colorEtapa(t.estado),
                                  t.estado === ETAPA_GANADA && esUltimo && 'ring-2 ring-check/30',
                                )}
                                aria-hidden="true"
                              />
                              <div className="text-[13px] font-semibold text-ink">{labelEtapa(t.estado)}</div>
                              <div className="mono text-[11px] text-muted mt-0.5">{t.fecha}</div>
                              <div className={cn('mono text-[11px] font-medium mt-0.5', colorEtapaTexto(t.estado))}>
                                {esCierre
                                  ? `${t.estado === ETAPA_GANADA ? 'Ganado' : 'On hold'} · ciclo total ${diasCiclo} ${diasCiclo === 1 ? 'día' : 'días'}`
                                  : `${dias} ${dias === 1 ? 'día' : 'días'} en etapa${esUltimo ? ' (hasta hoy)' : ''}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {/* Historial de toques */}
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                    Historial de toques ({data.toques.length})
                  </h4>
                  {data.toques.length === 0 ? (
                    <p className="text-xs text-muted">Todavía no hay toques registrados.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.toques.map((t) => (
                        <div key={t.idToque} className="border-l-2 border-line-card pl-3 py-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-ink-soft font-medium">{t.fecha ?? 'Sin fecha'}</span>
                            <CanalTag canal={t.canal} />
                          </div>
                          <div className="text-xs text-muted">{t.resultado ?? 'Sin resultado registrado'}</div>
                          {t.quePaso && <div className="text-xs text-muted mt-1 italic">{t.quePaso}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
