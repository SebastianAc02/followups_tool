'use client';

// Fase 7, Task 7.2: preview cinemático de la secuencia de toques (V5). Porta
// `Cinematic Sequence Preview html5/src/sections/SequencePreview.tsx` (proyecto Vite
// separado, ver plan) a los tokens semánticos de este proyecto. Es frontend puro:
// no agrega core nuevo, solo consume `renderizarCopy` (Fase 7.1) sobre los pasos ya
// resueltos de `getCadencia` + las fechas de `calcularCalendario` (ambos ya existen).
//
// DESVIACIÓN del proyecto de referencia: ese usa @phosphor-icons/react, que no está
// instalado en este repo (ni lo usa ninguna otra vista migrada). Se reemplazan los
// iconos por las iniciales/símbolos de texto que ya usa el resto del cockpit (mismo
// patrón que CanalTag: el canal es un dato con su color semántico, no un ícono).

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '../../ui/cn';
import { renderizarCopy } from '../../core/render-copy';
import type { Canal } from '../../ui/canal-tag.variants';

export type PasoPreview = {
  orden: number;
  dia: number;
  canal: Canal;
  asunto: string | null;
  cuerpo: string;
};

export type DestinatarioPreview = {
  nombre: string;
  cargo: string | null;
  empresa: string;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  remitente: string;
  remitenteEmail: string;
};

const CANAL_LABEL_CORTO: Record<Canal, string> = {
  correo: 'Correo',
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
};

const CANAL_TOKENS: Record<Canal, { texto: string; puntoBg: string; badge: string }> = {
  correo: {
    texto: 'text-canal-correo',
    puntoBg: 'bg-canal-correo',
    badge: 'border-canal-correo/30 bg-canal-correo/10 text-canal-correo',
  },
  llamada: {
    texto: 'text-accent-soft',
    puntoBg: 'bg-accent-soft',
    badge: 'border-accent-soft/30 bg-accent-soft/10 text-accent-soft',
  },
  whatsapp: {
    texto: 'text-canal-whatsapp',
    puntoBg: 'bg-canal-whatsapp',
    badge: 'border-canal-whatsapp/30 bg-canal-whatsapp/10 text-canal-whatsapp',
  },
};

const TOKEN_DONE = { texto: 'text-done', puntoBg: 'bg-done', badge: 'border-done/30 bg-done/10 text-done' };

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

// Resalta las sustituciones hechas por renderizarCopy: como el texto ya viene resuelto
// (variables ya sustituidas), no hay forma de saber qué substring vino de una variable
// sin volver a mirar el texto original. Se resalta buscando los VALORES conocidos del
// destinatario (nombre, empresa) dentro del texto ya renderizado -- mismo efecto visual
// que el mockup (pill violeta sobre "Hidaly"/"Giganav Connections"), sin reinventar el
// tracking de posiciones en renderizarCopy.
function resaltarValores(texto: string, valores: string[]): React.ReactNode {
  const unicos = [...new Set(valores.filter((v) => v.trim().length > 0))].sort((a, b) => b.length - a.length);
  if (unicos.length === 0) return texto;

  const patron = new RegExp(`(${unicos.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const partes = texto.split(patron);

  return partes.map((parte, i) =>
    unicos.includes(parte) ? (
      <span key={i} className="rounded bg-accent-soft/15 px-1 text-accent-soft">
        {parte}
      </span>
    ) : (
      <span key={i}>{parte}</span>
    ),
  );
}

function EmailPanel({
  paso,
  datos,
  visible,
}: {
  paso: PasoPreview;
  datos: DestinatarioPreview;
  visible: boolean;
}) {
  const asunto = renderizarCopy(paso.asunto ?? '', datos as unknown as Record<string, string>);
  const cuerpo = renderizarCopy(paso.cuerpo, datos as unknown as Record<string, string>);
  const valoresResaltar = [datos.nombre, datos.empresa];

  return (
    <div className={cn('transition-all duration-200 ease-out', visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface/60">
        <div className="flex items-center gap-3 border-b border-line/60 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-canal-correo/30 bg-canal-correo/15 font-serif text-sm font-semibold text-canal-correo">
            {iniciales(datos.remitente)}
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink">{datos.remitente}</div>
            <div className="text-xs text-muted">
              {datos.remitenteEmail} · para {datos.nombre}
            </div>
          </div>
          <span className="rounded-lg border border-canal-correo/30 bg-canal-correo/10 px-2.5 py-1 text-xs text-canal-correo">
            Correo · Día {paso.dia}
          </span>
        </div>
        <div className="p-5">
          {asunto.texto && <div className="mb-4 font-serif text-xl leading-snug tracking-tight text-ink">{resaltarValores(asunto.texto, valoresResaltar)}</div>}
          <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
            {cuerpo.texto.split('\n').filter((linea) => linea.trim().length > 0).map((linea, i) => (
              <p key={i}>{resaltarValores(linea, valoresResaltar)}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CallPanel({ paso, datos, visible }: { paso: PasoPreview; datos: DestinatarioPreview; visible: boolean }) {
  const cuerpo = renderizarCopy(paso.cuerpo, datos as unknown as Record<string, string>);
  const valoresResaltar = [datos.nombre, datos.empresa];
  const lineas = cuerpo.texto.split('\n').filter((linea) => linea.trim().length > 0);

  return (
    <div className={cn('transition-all duration-200 ease-out', visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-accent-soft/30 bg-accent-soft/10 text-accent-soft">
            ☎
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink">Llamada a {datos.nombre}</div>
            <div className="text-xs text-muted">
              {datos.telefono ?? 'sin teléfono'} · Día {paso.dia} · saliente
            </div>
          </div>
          <span className="rounded-lg border border-accent-soft/30 bg-accent-soft/10 px-2.5 py-1 text-xs text-accent-soft">Llamada</span>
        </div>
        <div className="space-y-4 rounded-2xl border border-line bg-surface/60 p-5">
          <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">Guion sugerido</div>
          {lineas.length > 0 ? (
            lineas.map((linea, i) => (
              <div
                key={i}
                className={cn('flex gap-4 transition-all duration-200 ease-out', visible ? '-translate-x-0 opacity-100' : '-translate-x-3 opacity-0')}
                style={{ transitionDelay: visible ? `${0.06 + i * 0.07}s` : '0s' }}
              >
                <span className="w-20 flex-shrink-0 pt-0.5 font-mono text-xs text-accent-soft">Paso {i + 1}</span>
                <span className="text-sm leading-relaxed text-ink-soft">{resaltarValores(linea, valoresResaltar)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-faint">Sin guion cargado para este paso.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function WhatsAppPanel({ paso, datos, visible }: { paso: PasoPreview; datos: DestinatarioPreview; visible: boolean }) {
  const cuerpo = renderizarCopy(paso.cuerpo, datos as unknown as Record<string, string>);
  const burbujas = cuerpo.texto.split('\n').filter((linea) => linea.trim().length > 0);

  return (
    <div className={cn('transition-all duration-200 ease-out', visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-canal-whatsapp/15 bg-canal-whatsapp/5">
        <div className="flex items-center gap-3 border-b border-canal-whatsapp/10 bg-canal-whatsapp/10 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-canal-whatsapp/30 bg-canal-whatsapp/20 text-xs font-semibold text-canal-whatsapp">
            {iniciales(datos.nombre)}
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink">{datos.nombre}</div>
            <div className="text-xs text-canal-whatsapp">en línea</div>
          </div>
          <span className="rounded-lg border border-canal-whatsapp/30 bg-canal-whatsapp/10 px-2.5 py-1 text-xs text-canal-whatsapp">
            WhatsApp · Día {paso.dia}
          </span>
        </div>
        <div className="min-h-48 space-y-2.5 p-4">
          {burbujas.length > 0 ? (
            burbujas.map((b, i) => (
              <div
                key={i}
                className={cn('flex justify-end transition-all duration-200 ease-out', visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}
                style={{ transitionDelay: visible ? `${i * 0.12}s` : '0s' }}
              >
                <div className="max-w-xs rounded-2xl rounded-br-sm bg-canal-whatsapp/25 px-3.5 py-2.5 text-sm leading-relaxed text-ink">
                  {resaltarValores(b, [datos.nombre, datos.empresa])}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-faint">Sin mensaje cargado para este paso.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DonePanel({ datos, pasos, visible }: { datos: DestinatarioPreview; pasos: PasoPreview[]; visible: boolean }) {
  const conteos = pasos.reduce(
    (acc, p) => {
      acc[p.canal] = (acc[p.canal] ?? 0) + 1;
      return acc;
    },
    {} as Record<Canal, number>,
  );
  const ultimoDia = pasos.at(-1)?.dia ?? 0;

  return (
    <div className={cn('transition-all duration-200 ease-out', visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0')}>
      <div className="mx-auto max-w-md pt-4 text-center">
        <div
          className={cn(
            'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-done/40 bg-done/10 transition-all duration-300 ease-out',
            visible ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
          )}
        >
          <span className="text-2xl text-done">✓</span>
        </div>
        <div className="mb-2 font-serif text-2xl tracking-tight text-ink">Secuencia completa</div>
        <div className="mb-7 text-sm leading-relaxed text-muted">
          {pasos.length} toques en {ultimoDia} días a {datos.nombre} · {datos.empresa}.
          <br />
          Todo queda registrado y listo para replicarse en el resto del segmento.
        </div>
        <div className="flex justify-center gap-3">
          {(Object.keys(conteos) as Canal[]).map((canal) => (
            <div key={canal} className="rounded-xl border border-line/50 bg-surface/60 px-5 py-3">
              <div className={cn('font-mono text-lg font-semibold', CANAL_TOKENS[canal].texto)}>{conteos[canal]}</div>
              <div className="mt-0.5 text-xs text-muted">{CANAL_LABEL_CORTO[canal].toLowerCase()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PreviewCinematico({ pasos, datos }: { pasos: PasoPreview[]; datos: DestinatarioPreview }) {
  // El último nodo es "Listo" (resumen), no un paso real: se agrega al final del track.
  const n = pasos.length + 1;
  const diaDeIndice = [...pasos.map((p) => p.dia), pasos.at(-1)?.dia ?? 0];
  const diaMax = Math.max(0, ...pasos.map((p) => p.dia));

  const [activeStep, setActiveStep] = useState(0);
  const [panelVisible, setPanelVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fillPct, setFillPct] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const activeStepRef = useRef(0);
  const previousPctRef = useRef(0);

  const applyStep = useCallback(
    (idx: number, animate = true) => {
      const clamped = Math.max(0, Math.min(n - 1, idx));
      const pct = (clamped / (n - 1)) * 100;
      activeStepRef.current = clamped;
      previousPctRef.current = pct;
      setActiveStep(clamped);
      setFillPct(pct);

      if (!animate) {
        setPanelVisible(true);
        return;
      }
      setPanelVisible(false);
      requestAnimationFrame(() => setPanelVisible(true));
    },
    [n],
  );

  const stopPlay = useCallback(() => {
    setIsPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startPlay = useCallback(() => {
    if (activeStepRef.current >= n - 1) applyStep(0, false);
    setIsPlaying(true);
  }, [n, applyStep]);

  const goPrevStep = useCallback(() => {
    stopPlay();
    applyStep(activeStepRef.current - 1, true);
  }, [stopPlay, applyStep]);

  const goNextStep = useCallback(() => {
    stopPlay();
    applyStep(activeStepRef.current + 1, true);
  }, [stopPlay, applyStep]);

  useEffect(() => {
    activeStepRef.current = activeStep;
  }, [activeStep]);

  useEffect(() => {
    if (!isPlaying) return;

    const durationMs = pasos.length > 0 ? pasos.length * 1600 : 1600;
    const startPct = previousPctRef.current / 100;
    const startedAt = performance.now() - startPct * durationMs;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const pct = progress * 100;

      if (Math.abs(pct - previousPctRef.current) >= 0.35 || progress >= 1) {
        previousPctRef.current = pct;
        setFillPct(pct);
      }

      const nextStep = Math.round(progress * (n - 1));
      if (nextStep !== activeStepRef.current) {
        activeStepRef.current = nextStep;
        setPanelVisible(false);
        setActiveStep(nextStep);
        requestAnimationFrame(() => setPanelVisible(true));
      }

      if (progress >= 1) {
        setIsPlaying(false);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, n, pasos.length]);

  const posToValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * (n - 1);
    },
    [n],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      stopPlay();
      setIsDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const value = posToValue(e.clientX);
      const pct = (value / (n - 1)) * 100;
      previousPctRef.current = pct;
      setFillPct(pct);
      applyStep(Math.round(value), true);
    },
    [stopPlay, posToValue, n, applyStep],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const value = posToValue(e.clientX);
      const pct = (value / (n - 1)) * 100;
      previousPctRef.current = pct;
      setFillPct(pct);
      const idx = Math.round(value);
      if (idx !== activeStepRef.current) applyStep(idx, true);
    },
    [isDragging, posToValue, n, applyStep],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    const pct = (activeStepRef.current / (n - 1)) * 100;
    previousPctRef.current = pct;
    setFillPct(pct);
  }, [n]);

  if (pasos.length === 0) {
    return <p className="p-6 text-[13px] text-muted">Esta cadencia todavía no tiene pasos para previsualizar.</p>;
  }

  const esResumen = activeStep >= pasos.length;
  const pasoActual = esResumen ? null : pasos[activeStep];
  const tokenActual = pasoActual ? CANAL_TOKENS[pasoActual.canal] : TOKEN_DONE;
  const diaActual = diaDeIndice[activeStep];

  return (
    <div className="overflow-hidden rounded-2xl border border-line-strong bg-bg shadow-[0_24px_70px_-28px_rgba(0,0,0,0.65)]">
      {/* Top bar: destinatario + controles */}
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent-soft/30 bg-accent-soft/20 font-serif text-sm font-semibold text-accent-soft">
            {iniciales(datos.nombre)}
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">{datos.nombre}</div>
            <div className="text-xs text-muted">
              {datos.cargo ?? 'Contacto'} · {datos.empresa}
              {datos.ciudad ? ` · ${datos.ciudad}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:block">Arrastra la línea, toca un nodo o inicia la simulación</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrevStep}
              disabled={activeStep <= 0}
              aria-label="Paso anterior"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong text-muted transition-all duration-150 ease-out hover:border-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goNextStep}
              disabled={activeStep >= n - 1}
              aria-label="Paso siguiente"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong text-muted transition-all duration-150 ease-out hover:border-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => (isPlaying ? stopPlay() : startPlay())}
            className="flex items-center gap-2 rounded-xl border border-accent-soft/35 bg-accent/10 px-4 py-2 text-xs font-semibold text-ink transition-all duration-150 ease-out hover:border-accent-soft/55 hover:bg-accent/15"
          >
            {isPlaying ? '⏸' : '▶'}
            {isPlaying ? 'Pausar' : activeStep >= n - 1 ? 'Simular otra vez' : 'Iniciar simulación'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 pb-6 pt-8 md:px-10">
        {/* Los nodos se posicionan por % (left), no por flex -- con poco ancho (sidebar
            angosto) se amontonan en vez de reflow. min-width + overflow-x-auto los
            separa siempre y el excedente se scrollea, en vez de superponerse. */}
        <div className="overflow-x-auto pb-1">
        {/* El padding va ACA, en un envoltorio aparte de trackRef, no en trackRef
            mismo: el 0%/100% de un hijo absoluto se ancla al borde EXTERIOR del
            padding-box de su contenedor relativo, asi que padding puesto directo en
            ese contenedor relativo (mi intento anterior) no corre el 0%/100% ni un
            pixel. Con el padding en ESTE div de afuera, trackRef queda metido hacia
            adentro y lo que sobresale cae dentro del padding de este envoltorio --
            adentro de su propia caja, nunca recortado.
            px-10 (40px), no menos: cada nodo (circulo + "Dia X" + canal) vive en una
            columna de width:80px centrada sobre su %, o sea la mitad de esos 80px
            (40px) puede sobresalir del track en el primer/ultimo nodo. Con menos
            padding el CIRCULO se veia completo pero el TEXTO ("Dia 0") seguia
            recortado -- 40px es lo que de verdad cubre el peor caso (la columna
            entera), no solo el circulo. */}
        <div className="px-10">
        <div
          ref={trackRef}
          className={cn('relative h-14 touch-none select-none', isDragging ? 'cursor-grabbing' : 'cursor-grab')}
          style={{ minWidth: `${n * 90}px` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="absolute left-0 right-0 top-[11px] h-0.5 rounded-full bg-line-strong" />
          <div
            className="absolute left-0 top-[11px] h-0.5 rounded-full bg-accent-soft transition-all duration-150 ease-out"
            style={{ width: `${fillPct}%` }}
          />
          <div
            className="absolute top-[11px] z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-soft bg-ink shadow-lg transition-all duration-150 ease-out"
            style={{ left: `${fillPct}%` }}
          />

          {[...pasos, null].map((paso, i) => {
            const pct = (i / (n - 1)) * 100;
            const isActive = i === activeStep;
            const isPast = i < activeStep;
            const token = paso ? CANAL_TOKENS[paso.canal] : TOKEN_DONE;
            const label = paso ? CANAL_LABEL_CORTO[paso.canal] : 'Listo';
            const dia = paso ? paso.dia : diaMax;

            return (
              <div
                key={i}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${pct}%`, transform: 'translateX(-50%)', width: '80px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  stopPlay();
                  applyStep(i, true);
                }}
              >
                <div
                  className={cn(
                    'z-20 h-3.5 w-3.5 rounded-full border-2 border-bg transition-all duration-150 ease-out',
                    token.puntoBg,
                    isActive ? 'scale-150 shadow-lg' : isPast ? 'opacity-80' : 'opacity-40',
                  )}
                />
                {/* El nodo "Listo" reusa el dia del ultimo paso real solo para
                    posicionarse en el track (no tiene dia propio) -- mostrar "Día X"
                    ahi tambien duplicaba el numero del paso anterior, como si fueran
                    dos dias distintos que resultan ser el mismo. */}
                <span className={cn('mt-2.5 font-mono text-[10px] transition-colors duration-150', isActive ? 'text-ink' : 'text-muted')}>
                  {paso ? `Día ${dia}` : 'Fin'}
                </span>
                <span
                  className={cn(
                    'mt-0.5 whitespace-nowrap text-[10px] transition-colors duration-150',
                    isActive ? token.texto : isPast ? 'text-muted' : 'text-faint',
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        </div>
        </div>

        {/* Franja de calendario 0..diaMax. flex+wrap+justify-center en vez de grid-cols-8:
            un grid deja la ULTIMA fila incompleta pegada a la izquierda (no tiene forma
            nativa de centrarla) -- flex-wrap si centra cada fila, la ultima incluida,
            porque justify-content actua por fila, no sobre la grilla entera. Cada
            cajon lleva un ancho fijo (8 por fila, 7 gaps de 6px = 42px) para que el
            wrap caiga exactamente cada 8, igual que antes con grid-cols-8. */}
        <div className="mt-6 flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: Math.max(diaMax + 1, 8) }, (_, d) => d).map((d) => {
            const pasoDelDia = pasos.find((p) => p.dia === d);
            const esHoy = d === diaActual && !esResumen;
            const esPasado = d < diaActual;
            return (
              <div
                key={d}
                className={cn(
                  'w-[calc((100%-42px)/8)] shrink-0 rounded-xl border px-1.5 py-2 text-center transition-all duration-150 ease-out',
                  esHoy ? 'border-accent-soft/40 bg-accent/10' : esPasado ? 'border-line/30 bg-surface/40' : 'border-line/20 bg-transparent',
                )}
              >
                <div className={cn('font-mono text-[9px] md:text-[10px]', esHoy ? 'text-ink' : esPasado ? 'text-muted' : 'text-faint')}>
                  Día {d}
                </div>
                <div className="mt-1.5 flex justify-center">
                  {pasoDelDia ? (
                    <span className={cn('h-1.5 w-1.5 rounded-full', CANAL_TOKENS[pasoDelDia.canal].puntoBg, esHoy ? 'opacity-100' : 'opacity-60')} />
                  ) : (
                    <span className="h-1 w-1 rounded-full bg-line-strong" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel de detalle */}
      <div className="min-h-72 border-t border-line px-6 py-8 md:min-h-80 md:px-10">
        <div className="mb-6 flex items-center gap-2">
          <span className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs', tokenActual.badge)}>
            {esResumen ? 'Listo' : CANAL_LABEL_CORTO[pasoActual!.canal]}
          </span>
          <span className="text-muted">→</span>
          <span className="font-mono text-xs text-muted">Día {diaActual}</span>
        </div>

        {!esResumen && pasoActual?.canal === 'correo' && <EmailPanel paso={pasoActual} datos={datos} visible={panelVisible} />}
        {!esResumen && pasoActual?.canal === 'llamada' && <CallPanel paso={pasoActual} datos={datos} visible={panelVisible} />}
        {!esResumen && pasoActual?.canal === 'whatsapp' && <WhatsAppPanel paso={pasoActual} datos={datos} visible={panelVisible} />}
        {esResumen && <DonePanel datos={datos} pasos={pasos} visible={panelVisible} />}
      </div>
    </div>
  );
}
