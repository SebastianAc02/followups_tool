'use client';

import { useEffect, useState, useTransition } from 'react';
import type { DefinicionSegmento } from '../../db/validation';
import {
  previsualizarConReadinessAction,
  guardarSegmentoAction,
  actualizarSegmentoAction,
  obtenerSegmentoAction,
  type PreviewConReadiness,
} from '../actions';
import { cn } from '../../ui/cn';
import { FiltroWall } from './FiltroWall';
import { CopilotoPanel } from './CopilotoPanel';
import { TablaCuentas } from './TablaCuentas';
import { PasosWizard, type PasoWizardItem } from './PasosWizard';
import type { Opciones, Segmento } from './NuevaCampanaFlujo';

const VACIO: DefinicionSegmento = { condiciones: [] };
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const PASOS_SEGMENTO: PasoWizardItem[] = [
  { label: 'Segmento' },
  { label: 'Cadencia' },
  { label: 'Destinatarios' },
  { label: 'Preview' },
  { label: 'Lanzar' },
];

// Nombre automatico para el autosave silencioso: "Segmento 8 jul · 14:32". Renombrable
// despues (el input de nombre queda editable igual, esto solo evita bloquear el
// autosave con "el segmento necesita un nombre" antes de que el usuario escriba uno.
function nombreSegmentoAutomatico(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `Segmento ${dd} ${MESES_CORTOS[d.getMonth()]} · ${hh}:${mm}`;
}

type Props = {
  opciones: Opciones;
  segmentosGuardados: Segmento[];
  reanudarDesde?: Segmento | null;
  onGuardado: (s: Segmento) => void;
};

export function NuevoSegmento({ opciones, segmentosGuardados, reanudarDesde, onGuardado }: Props) {
  const [def, setDef] = useState<DefinicionSegmento>(VACIO);
  // ids de la version ANTERIOR del segmento; se usan una sola vez para marcar
  // "relajada" las filas que el relleno del Copiloto sumo, luego se limpian.
  const [idsPrevios, setIdsPrevios] = useState<string[] | undefined>(undefined);
  const [preview, setPreview] = useState<PreviewConReadiness | null>(null);
  const [nombre, setNombre] = useState('');
  const [ultimaFrase, setUltimaFrase] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mostrarCopiloto, setMostrarCopiloto] = useState(true);
  const [, startTransition] = useTransition();

  // Autosave silencioso: en cuanto hay 1+ filtro, el segmento nace en la base con un
  // nombre automatico -- si Sebastian cierra la pestaña aca, el draft ya quedo
  // recuperable via "Usar un segmento guardado...". idSegmentoAuto es la MISMA fila
  // que se actualiza en cada ajuste de filtro despues (nunca crea una segunda).
  const [idSegmentoAuto, setIdSegmentoAuto] = useState<number | null>(null);
  const [autosaveEstado, setAutosaveEstado] = useState<'idle' | 'guardando' | 'guardado'>('idle');
  // Volver a Segmento desde Cadencia le pasa reanudarDesde: sin esto, este componente
  // remonta en blanco y el filtro ya armado (aunque siga vivo en la base) desaparece
  // de la pantalla como si se hubiera perdido.
  const [cargandoReanudar, setCargandoReanudar] = useState(!!reanudarDesde);

  // Cargar un segmento guardado (reanudar al volver, o elegir uno del dropdown en
  // FiltroWall) SOLO trae sus filtros a esta pantalla para seguir editando -- no
  // avanza a Cadencia por su cuenta. Antes elegir del dropdown saltaba directo a
  // Cadencia; Sebastian pidio que se comporte igual que "volver": cargar y quedarse.
  async function cargarSegmentoGuardado(s: Segmento) {
    setCargandoReanudar(true);
    const res = await obtenerSegmentoAction(s.id);
    if (res.ok) {
      setDef(res.segmento.definicion);
      setNombre(res.segmento.nombre);
      setIdSegmentoAuto(res.segmento.id);
      setAutosaveEstado('guardado');
    }
    setCargandoReanudar(false);
  }

  useEffect(() => {
    if (!reanudarDesde) {
      setCargandoReanudar(false);
      return;
    }
    void cargarSegmentoGuardado(reanudarDesde);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reanudarDesde?.id]);

  useEffect(() => {
    if (def.condiciones.length === 0) {
      setPreview(null);
      return;
    }
    const idsParaMarcar = idsPrevios;
    startTransition(async () => {
      setPreview(await previsualizarConReadinessAction(def, idsParaMarcar));
    });
    setIdsPrevios(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def]);

  useEffect(() => {
    if (def.condiciones.length === 0) return;
    setAutosaveEstado('guardando');
    const timer = setTimeout(() => {
      (async () => {
        if (idSegmentoAuto == null) {
          const nombreAuto = nombreSegmentoAutomatico();
          const res = await guardarSegmentoAction(nombreAuto, def);
          if (res.ok) {
            setIdSegmentoAuto(res.idSegmento);
            setNombre((actual) => actual || nombreAuto);
            setAutosaveEstado('guardado');
          } else {
            setAutosaveEstado('idle');
          }
        } else {
          const res = await actualizarSegmentoAction(idSegmentoAuto, { definicion: def });
          setAutosaveEstado(res.ok ? 'guardado' : 'idle');
        }
      })();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def]);

  async function guardar() {
    setError('');
    const limpio = nombre.trim();
    if (!limpio) {
      setError('El segmento necesita un nombre');
      return;
    }
    setGuardando(true);
    // El autosave ya creo la fila -- guardar aca solo confirma el nombre final (si
    // cambio) y avanza. Sin autosave todavia (raro: solo si aun no aterriza la
    // primera llamada), crea la fila de una vez, mismo camino que antes.
    const r =
      idSegmentoAuto != null
        ? await actualizarSegmentoAction(idSegmentoAuto, { nombre: limpio }).then((res) => (res.ok ? { ok: true as const, idSegmento: idSegmentoAuto } : res))
        : await guardarSegmentoAction(limpio, def);
    setGuardando(false);
    if (r.ok) {
      onGuardado({ id: r.idSegmento, nombre: limpio, descripcionNatural: ultimaFrase || null });
    } else {
      setError(r.error);
    }
  }

  if (cargandoReanudar) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-[18px] border border-line bg-bg py-24 text-[13px] text-muted">
        Retomando el segmento…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-line bg-bg shadow-[0_30px_70px_-28px_rgba(0,0,0,.6)]">
      {/* El header se parte en las MISMAS dos zonas que el grid de abajo (columna
          Filtros+Tabla a la izquierda, Copiloto a la derecha, ancho fijo 340px para
          que calcen exacto) -- Sebastian pidio ver esto "estirado hacia arriba" en
          vez de una sola fila apretando breadcrumb + dropdown + Copiloto + Guardar
          todo junto.
          justify-between es lo que de verdad ancla la zona de 340px al borde
          derecho: sin esto, PasosWizard (sin flex-1 propio) solo ocupa el ancho de
          su contenido, y con mas espacio disponible (sidebar colapsado) la zona de
          Copiloto se corria hacia la izquierda en vez de quedarse pegada al borde
          -- por eso se veia desalineada con el panel Copiloto de abajo segun el
          sidebar estuviera abierto o cerrado. */}
      <div className="flex shrink-0 items-stretch justify-between border-b border-line">
        <PasosWizard pasos={PASOS_SEGMENTO} activo="Segmento" />
        <div className="flex w-[340px] shrink-0 items-center justify-end gap-3 border-l border-line px-6 py-[15px]">
          <button
            type="button"
            onClick={() => setMostrarCopiloto((v) => !v)}
            aria-pressed={mostrarCopiloto}
            title={mostrarCopiloto ? 'Ocultar Copiloto' : 'Mostrar Copiloto'}
            className="flex items-center gap-[7px] rounded-lg border border-line-strong px-3 py-[9px] text-[13px] text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
          >
            <span className="text-accent">✦</span>
            Copiloto
            <span
              className={
                mostrarCopiloto
                  ? 'relative h-[14px] w-[24px] rounded-full bg-accent transition-colors'
                  : 'relative h-[14px] w-[24px] rounded-full bg-line-strong transition-colors'
              }
            >
              <span
                className={
                  mostrarCopiloto
                    ? 'absolute right-[2px] top-[2px] h-[10px] w-[10px] rounded-full bg-bg transition-all'
                    : 'absolute left-[2px] top-[2px] h-[10px] w-[10px] rounded-full bg-bg transition-all'
                }
              />
            </span>
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!preview?.ok || def.condiciones.length === 0 || guardando}
            className="rounded-[9px] bg-accent px-4 py-[9px] text-[13px] font-semibold text-bg disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </div>
      </div>

      <div className={cn('grid min-h-0 flex-1', mostrarCopiloto ? 'grid-cols-[220px_1fr_340px]' : 'grid-cols-[220px_1fr]')}>
        <FiltroWall
          value={def}
          onChange={setDef}
          opciones={opciones}
          segmentosGuardados={segmentosGuardados}
          onElegirGuardado={cargarSegmentoGuardado}
          nombreSegmento={nombre}
          onNombreSegmentoChange={setNombre}
          mostrarNombre
          autosaveEstado={autosaveEstado}
          error={error}
        />

        {preview?.ok ? (
          <TablaCuentas filas={preview.filas} conteos={preview.conteos} />
        ) : preview && !preview.ok ? (
          <div className="min-h-0 min-w-0 border-r border-line px-[22px] py-6">
            <p className="text-[13px] text-overdue">{preview.error}</p>
          </div>
        ) : (
          <div className="min-h-0 min-w-0 border-r border-line px-[22px] py-6">
            <p className="text-[13px] text-muted">Agrega un filtro o pídele al Copiloto que arme el segmento.</p>
          </div>
        )}

        {mostrarCopiloto && (
          <CopilotoPanel
            estadoActual={def}
            total={preview?.ok ? preview.conteos.total : undefined}
            onResultado={(r) => {
              if (r.relleno && preview?.ok) setIdsPrevios(preview.filas.map((f) => f.id));
              setUltimaFrase(r.frase);
              setDef(r.estado);
            }}
          />
        )}
      </div>
    </div>
  );
}
