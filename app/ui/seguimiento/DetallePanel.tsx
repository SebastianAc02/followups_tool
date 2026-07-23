// Ficha completa de una empresa desde el Pipeline: todos los contactos, la secuencia
// de la cadencia activa (timeline hecho/activo/pendiente) y TODO el historial real de
// toques -- pedido de Sebastian (2026-07-10): "todo, todo, todo", no un resumen.
// Modal centrado (no un drawer angosto): esta vista es de lectura completa, necesita
// mas ancho que 384px para no amontonar contactos + timeline + historial.
'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';
import { CanalTag, type Canal } from '../CanalTag';
import { FUNNEL_ETAPAS, ETAPA_GANADA, ETAPA_ONHOLD } from '../../db/funnel';
import type { HistorialEtapas, PlanCatalogo } from '../../db/repository';
import { calcularDuracionPorEtapa } from '../../core/tiempoEnEtapa';
import { calcularMrrEstimado, digitalPctConDefault } from '../../core/mrr';
import { probabilidadCierrePorEtapa } from '../../core/probabilidadCierre';
import {
  listarPlanesAction,
  asignarPlanAction,
  actualizarPctDigitalAction,
  actualizarUsuariosEstimadosAction,
} from '../../seguimiento/actions';

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

// Placeholders de import/CRM que no son un dato real -- se tratan como vacio en vez de
// mostrarle "Unknown" literal a Sebastian.
const VALORES_BASURA = new Set(['unknown', 'n/a', 'na', 'null', 'undefined', '-']);
function valorLimpio(valor: string | null): string | null {
  if (!valor) return null;
  return VALORES_BASURA.has(valor.trim().toLowerCase()) ? null : valor;
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
  idEmpresa: string;
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
  // Cara financiera del deal (2026-07-22, plan-panel-metricas-tiempo-real.md): crudos,
  // sin formula -- este componente aplica calcularMrrEstimado/digitalPctConDefault/
  // probabilidadCierrePorEtapa (core, puras) igual que ya hace con calcularDuracionPorEtapa
  // arriba para el timeline.
  plan: { id: number; nombre: string; saasMensual: number; tarifaTxn: number } | null;
  pctDigital: number | null; // 0..1 crudo; null = sin capturar (se aplica el default 40%)
  usuariosEstimados: number | null;
  usuariosEfectivos: number | null;
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

  // --- Datos financieros (Fase 1 punto 4, plan-panel-metricas-tiempo-real.md) --------
  //
  // Copia local editable de la cara financiera: `data` la trae el padre (fetch al abrir
  // la ficha) y este componente no puede escribirle de vuelta -- por eso se copia a un
  // estado propio en cuanto llega, y las acciones de guardar actualizan ESA copia
  // (optimista) para que el numero se vea al toque sin esperar un refetch completo de la
  // ficha. Se resincroniza cada vez que cambia la empresa abierta (data?.idEmpresa).
  const [financiero, setFinanciero] = useState<{
    plan: DetallePanelData['plan'];
    pctDigital: number | null;
    usuariosEstimados: number | null;
    usuariosEfectivos: number | null;
  } | null>(null);
  useEffect(() => {
    setFinanciero(
      data
        ? { plan: data.plan, pctDigital: data.pctDigital, usuariosEstimados: data.usuariosEstimados, usuariosEfectivos: data.usuariosEfectivos }
        : null,
    );
  }, [data]);

  const [planes, setPlanes] = useState<PlanCatalogo[]>([]);
  useEffect(() => {
    listarPlanesAction().then(setPlanes);
  }, []);

  const [guardandoPlan, startPlanTransition] = useTransition();
  function guardarPlan(idPlanRaw: string) {
    if (!data) return;
    const idPlan = idPlanRaw === '' ? null : Number(idPlanRaw);
    startPlanTransition(async () => {
      const res = await asignarPlanAction(data.idEmpresa, idPlan);
      if (res.ok) {
        const nuevoPlan = idPlan === null ? null : planes.find((p) => p.id === idPlan) ?? null;
        setFinanciero((f) => (f ? { ...f, plan: nuevoPlan } : f));
      }
    });
  }

  const [editandoDigital, setEditandoDigital] = useState(false);
  const [valorDigital, setValorDigital] = useState('');
  const [errorDigital, setErrorDigital] = useState<string | null>(null);
  const [guardandoDigital, startDigitalTransition] = useTransition();

  function abrirEdicionDigital() {
    setValorDigital(financiero?.pctDigital != null ? String(Math.round(financiero.pctDigital * 100)) : '');
    setErrorDigital(null);
    setEditandoDigital(true);
  }

  function guardarDigital() {
    if (!data) return;
    const texto = valorDigital.trim();
    const num = texto === '' ? null : Number(texto);
    if (num !== null && (!Number.isFinite(num) || num < 0 || num > 100)) {
      setErrorDigital('Debe ser un numero entre 0 y 100');
      return;
    }
    setErrorDigital(null);
    startDigitalTransition(async () => {
      const res = await actualizarPctDigitalAction(data.idEmpresa, num);
      if (res.ok) {
        setFinanciero((f) => (f ? { ...f, pctDigital: num === null ? null : num / 100 } : f));
        setEditandoDigital(false);
      } else {
        setErrorDigital(res.error);
      }
    });
  }

  const [editandoUsuarios, setEditandoUsuarios] = useState(false);
  const [valorUsuarios, setValorUsuarios] = useState('');
  const [errorUsuarios, setErrorUsuarios] = useState<string | null>(null);
  const [guardandoUsuarios, startUsuariosTransition] = useTransition();

  function abrirEdicionUsuarios() {
    setValorUsuarios(financiero?.usuariosEstimados != null ? String(financiero.usuariosEstimados) : '');
    setErrorUsuarios(null);
    setEditandoUsuarios(true);
  }

  function guardarUsuarios() {
    if (!data) return;
    const texto = valorUsuarios.trim();
    if (!texto) return;
    setErrorUsuarios(null);
    startUsuariosTransition(async () => {
      const res = await actualizarUsuariosEstimadosAction(data.idEmpresa, texto);
      if (res.ok) {
        const num = Number(texto);
        // usuariosEfectivos = COALESCE(reales, estimados) en la DB real -- si ya habia un
        // efectivo (viene de "reales"), este edit de "estimados" no lo cambia; si no habia
        // ninguno, el nuevo estimado pasa a ser el efectivo. No se puede distinguir el caso
        // exacto solo con este numero, pero la ficha se refresca completa la proxima vez
        // que se abre (perfilPipelineEmpresaAction), asi que esto es solo la vista optimista.
        setFinanciero((f) => (f ? { ...f, usuariosEstimados: num, usuariosEfectivos: f.usuariosEfectivos ?? num } : f));
        setEditandoUsuarios(false);
      } else {
        setErrorUsuarios(res.error);
      }
    });
  }

  if (!isOpen || !montado) return null;

  // MRR potencial / probabilidad de cierre: mismas funciones puras de core/ que ya usa
  // el endpoint /api/panel/pipeline (route.ts) -- sin plan asignado, mrrPotencial es null
  // (nunca un 0 falso, regla del plan). Probabilidad es heuristica por etapa, no una
  // medicion real (ver core/probabilidadCierre.ts).
  const digitalPctEfectivo = digitalPctConDefault(financiero?.pctDigital ?? null);
  const mrrPotencial = financiero?.plan
    ? calcularMrrEstimado({
        usuarios: financiero.usuariosEfectivos ?? 0,
        digitalPct: digitalPctEfectivo,
        tarifaTxnPlan: financiero.plan.tarifaTxn,
        saasMensual: financiero.plan.saasMensual,
      })
    : null;
  const probabilidad = probabilidadCierrePorEtapa(timelineEtapas?.etapaActual ?? null);

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
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="font-serif text-xl font-semibold text-ink truncate">{data.empresa}</h3>
                    {timelineEtapas?.etapaActual && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide flex-shrink-0',
                          'bg-pipeline-card border border-line-card',
                          colorEtapaTexto(timelineEtapas.etapaActual),
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', colorEtapa(timelineEtapas.etapaActual))} />
                        {labelEtapa(timelineEtapas.etapaActual)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted truncate mt-0.5">
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

                {/* Datos financieros del deal: plan, %digital, usuarios (editables) + MRR
                    potencial y probabilidad de cierre (calculados, solo lectura). */}
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Datos financieros</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Plan */}
                    <div className="bg-pipeline-card border border-line-card rounded-lg p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">Plan</div>
                      <select
                        value={financiero?.plan?.id ?? ''}
                        onChange={(e) => guardarPlan(e.target.value)}
                        disabled={guardandoPlan}
                        className="w-full rounded-md border border-line bg-shell px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
                      >
                        <option value="">Sin plan asignado</option>
                        {planes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* % digital */}
                    <div className="bg-pipeline-card border border-line-card rounded-lg p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">% digital</div>
                      {editandoDigital ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              type="number"
                              min={0}
                              max={100}
                              value={valorDigital}
                              onChange={(e) => setValorDigital(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') guardarDigital();
                                if (e.key === 'Escape') setEditandoDigital(false);
                              }}
                              disabled={guardandoDigital}
                              className="w-full rounded-md border border-line bg-shell px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent"
                            />
                            <button
                              type="button"
                              onClick={guardarDigital}
                              disabled={guardandoDigital}
                              className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-shell disabled:opacity-40"
                            >
                              {guardandoDigital ? '…' : 'Guardar'}
                            </button>
                          </div>
                          {errorDigital && <p className="text-[11px] text-overdue">{errorDigital}</p>}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={abrirEdicionDigital}
                          title="Editar % digital del deal"
                          className="text-[13px] font-semibold text-ink hover:text-accent"
                        >
                          {financiero?.pctDigital != null
                            ? `${Math.round(financiero.pctDigital * 100)}%`
                            : `${Math.round(digitalPctEfectivo * 100)}% (default)`}
                        </button>
                      )}
                    </div>

                    {/* Usuarios estimados */}
                    <div className="bg-pipeline-card border border-line-card rounded-lg p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">Usuarios estimados</div>
                      {editandoUsuarios ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              type="number"
                              min={0}
                              value={valorUsuarios}
                              onChange={(e) => setValorUsuarios(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') guardarUsuarios();
                                if (e.key === 'Escape') setEditandoUsuarios(false);
                              }}
                              disabled={guardandoUsuarios}
                              className="w-full rounded-md border border-line bg-shell px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent"
                            />
                            <button
                              type="button"
                              onClick={guardarUsuarios}
                              disabled={guardandoUsuarios || !valorUsuarios.trim()}
                              className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-shell disabled:opacity-40"
                            >
                              {guardandoUsuarios ? '…' : 'Guardar'}
                            </button>
                          </div>
                          {errorUsuarios && <p className="text-[11px] text-overdue">{errorUsuarios}</p>}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={abrirEdicionUsuarios}
                          title="Editar usuarios estimados del deal"
                          className="text-[13px] font-semibold text-ink hover:text-accent"
                        >
                          {financiero?.usuariosEstimados != null ? financiero.usuariosEstimados.toLocaleString('en-US') : 'Sin dato'}
                        </button>
                      )}
                    </div>

                    {/* MRR potencial (calculado, solo lectura) */}
                    <div className="bg-pipeline-card border border-line-card rounded-lg p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">MRR potencial</div>
                      <div className="text-[13px] font-semibold text-ink">
                        {mrrPotencial !== null ? `$${mrrPotencial.toLocaleString('es-CO')}` : 'Sin datos (falta plan)'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 text-[11px] text-muted">
                    Probabilidad de cierre (heurística por etapa):{' '}
                    <span className="font-semibold text-ink-soft">{Math.round(probabilidad.valor * 100)}%</span>
                  </div>
                </section>

                {/* Contactos */}
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                    Contactos ({data.contactos.length})
                  </h4>
                  {data.contactos.length === 0 ? (
                    <p className="text-xs text-muted">Sin contactos registrados.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {data.contactos.map((c, i) => {
                        const nombre = valorLimpio(c.nombre);
                        const cargo = valorLimpio(c.cargo);
                        const telefono = valorLimpio(c.telefono);
                        const email = valorLimpio(c.email);
                        return (
                          <div key={i} className="bg-pipeline-card border border-line-card rounded-lg p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-ink truncate">{nombre ?? 'Sin nombre'}</span>
                              {c.esPrincipal && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-accent flex-shrink-0">
                                  Principal
                                </span>
                              )}
                            </div>
                            {cargo && <div className="text-xs text-muted truncate mt-0.5">{cargo}</div>}
                            {(telefono || email) && (
                              <div className="mt-2 pt-2 border-t border-line-card/60 space-y-1">
                                {telefono && <div className="mono text-[11px] text-ink-soft truncate">{telefono}</div>}
                                {email && <div className="mono text-[11px] text-ink-soft truncate">{email}</div>}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                      timelineEtapas.etapaActual ? (
                        <div className="relative pl-1">
                          <div className="relative pl-7">
                            <span
                              className={cn(
                                'absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full border-2 border-shell flex-shrink-0',
                                colorEtapa(timelineEtapas.etapaActual),
                              )}
                              aria-hidden="true"
                            />
                            <div className="text-[13px] font-semibold text-ink">{labelEtapa(timelineEtapas.etapaActual)}</div>
                            <div className="mono text-[11px] text-muted mt-0.5">
                              Sin transiciones registradas aún — días en etapa: —
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted">Sin etapa comercial asignada.</p>
                      )
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
                        {(() => {
                          // calcularDuracionPorEtapa (core, probado) hace el emparejamiento de
                          // ventanas -- la UI solo pinta, ya no recalcula fechas a mano.
                          const ventanas = calcularDuracionPorEtapa(timelineEtapas, new Date().toISOString());
                          const inicioCiclo = new Date(ventanas[0].fechaInicio).getTime();

                          return ventanas.map((v, i) => {
                            const esUltimo = v.fechaFin === null;
                            const esCierre = esUltimo && (v.estado === ETAPA_GANADA || v.estado === ETAPA_ONHOLD);
                            const diasCiclo = Math.round((new Date(v.fechaInicio).getTime() - inicioCiclo) / MS_POR_DIA);

                            return (
                              <div key={`${v.estado}-${v.fechaInicio}-${i}`} className="relative pb-4 pl-7 last:pb-0">
                                <span
                                  className={cn(
                                    'absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full border-2 border-shell flex-shrink-0',
                                    colorEtapa(v.estado),
                                    v.estado === ETAPA_GANADA && esUltimo && 'ring-2 ring-check/30',
                                  )}
                                  aria-hidden="true"
                                />
                                <div className="text-[13px] font-semibold text-ink">{labelEtapa(v.estado)}</div>
                                <div className="mono text-[11px] text-muted mt-0.5">{v.fechaInicio}</div>
                                <div className={cn('mono text-[11px] font-medium mt-0.5', colorEtapaTexto(v.estado))}>
                                  {esCierre
                                    ? `${v.estado === ETAPA_GANADA ? 'Ganado' : 'On hold'} · ciclo total ${diasCiclo} ${diasCiclo === 1 ? 'día' : 'días'}`
                                    : `${v.dias} ${v.dias === 1 ? 'día' : 'días'} en etapa${esUltimo ? ' (hasta hoy)' : ''}`}
                                </div>
                              </div>
                            );
                          });
                        })()}
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
