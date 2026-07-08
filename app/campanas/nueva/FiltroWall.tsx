'use client';

import { useState } from 'react';
import { cn } from '../../ui/cn';
import type { CampoSegmentoNumerico, DefinicionSegmento } from '../../db/validation';
import type { Segmento } from './NuevaCampanaFlujo';

type Condicion = DefinicionSegmento['condiciones'][number];

const CAMPOS_TEXTO = ['estado', 'categoria', 'estado_comercial', 'ciudad', 'departamento', 'owner', 'rol'] as const;
const CAMPOS_RANGO: CampoSegmentoNumerico[] = ['usuarios', 'prioridad', 'personas'];

const LABELS: Record<string, string> = {
  estado: 'Estado del deal',
  categoria: 'Categoría',
  estado_comercial: 'Estado comercial',
  ciudad: 'Ciudad',
  departamento: 'Región',
  owner: 'Owner',
  rol: 'Rol del contacto',
  usuarios: 'Usuarios',
  prioridad: 'Prioridad',
  personas: 'Personas en la cuenta',
};

function valorTexto(c: Condicion): string {
  switch (c.op) {
    case 'en':
      return c.valores.join(', ');
    case 'no_en':
      return `no: ${c.valores.join(', ')}`;
    case 'entre':
      return `${c.desde.toLocaleString('es-CO')} – ${c.hasta.toLocaleString('es-CO')}`;
    case 'mayor_que':
      return `> ${c.valor.toLocaleString('es-CO')}`;
    case 'menor_que':
      return `< ${c.valor.toLocaleString('es-CO')}`;
    case 'es_null':
      return 'sin valor';
    case 'no_null':
      return 'con valor';
  }
}

type Props = {
  value: DefinicionSegmento;
  onChange: (def: DefinicionSegmento) => void;
  opciones: Record<(typeof CAMPOS_TEXTO)[number], string[]>;
  segmentosGuardados?: Segmento[];
  onElegirGuardado?: (s: Segmento) => void;
  nombreSegmento?: string;
  onNombreSegmentoChange?: (v: string) => void;
  mostrarNombre?: boolean;
  autosaveEstado?: 'idle' | 'guardando' | 'guardado';
  error?: string;
};

export function FiltroWall({
  value,
  onChange,
  opciones,
  segmentosGuardados,
  onElegirGuardado,
  nombreSegmento,
  onNombreSegmentoChange,
  mostrarNombre,
  autosaveEstado,
  error,
}: Props) {
  const condiciones = value.condiciones;
  const [editando, setEditando] = useState<number | null>(null);

  function set(nuevas: Condicion[]) {
    onChange({ ...value, condiciones: nuevas });
  }
  function agregarTexto(campo: (typeof CAMPOS_TEXTO)[number]) {
    set([...condiciones, { campo, op: 'en', valores: [opciones[campo]?.[0] ?? ''] }]);
    setEditando(condiciones.length);
  }
  function agregarRango(campo: CampoSegmentoNumerico) {
    set([...condiciones, { campo, op: 'entre', desde: 0, hasta: campo === 'usuarios' ? 10000 : 9 }]);
    setEditando(condiciones.length);
  }
  function actualizar(i: number, c: Condicion) {
    set(condiciones.map((prev, j) => (j === i ? c : prev)));
  }
  function quitar(i: number) {
    set(condiciones.filter((_, j) => j !== i));
    setEditando(null);
  }

  const camposUsados = new Set(condiciones.map((c) => c.campo));
  const textoDisponible = CAMPOS_TEXTO.filter((c) => !camposUsados.has(c));
  const rangoDisponible = CAMPOS_RANGO.filter((c) => !camposUsados.has(c));

  return (
    <div className="min-h-0 min-w-0 overflow-y-auto border-r border-line px-[18px] py-5">
      {/* Primero lo primero: nombrar el segmento nuevo, o usar uno ya guardado. Antes
          el nombre no aparecia en ningun lado hasta que ya habia 1+ filtro (Sebastian
          reporto que "no tengo donde ponerle nombre" al llegar a la pantalla), y el
          dropdown vivia arriba a la derecha del todo, apretado contra Copiloto/Guardar. */}
      {mostrarNombre && (
        <div className="mb-5 flex flex-col gap-2 border-b border-line pb-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Nombra tu nuevo segmento</span>
            {autosaveEstado && autosaveEstado !== 'idle' && (
              <span className="text-[11px] text-faint">{autosaveEstado === 'guardando' ? 'Guardando…' : 'Guardado ✓'}</span>
            )}
          </div>
          <input
            value={nombreSegmento ?? ''}
            onChange={(e) => onNombreSegmentoChange?.(e.target.value)}
            placeholder="Nombre del segmento"
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-[9px] text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink-soft"
          />
          {error && <p className="text-[12px] text-overdue">{error}</p>}
        </div>
      )}

      {segmentosGuardados && segmentosGuardados.length > 0 && (
        <div className="mb-5 border-b border-line pb-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Segmentos guardados</div>
          <select
            defaultValue=""
            onChange={(e) => {
              const id = Number(e.target.value);
              const s = segmentosGuardados.find((seg) => seg.id === id);
              if (s) onElegirGuardado?.(s);
            }}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-[9px] text-[13px] text-ink-soft outline-none"
          >
            <option value="" disabled>
              Usar un segmento guardado…
            </option>
            {segmentosGuardados.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Filtros del Copiloto</div>

      <div className="flex flex-col gap-[9px]">
        {condiciones.map((c, i) => (
          <div
            key={i}
            className="rounded-[9px] border border-accent/30 bg-accent/10 px-[11px] py-[9px] transition-all duration-150 hover:-translate-y-px hover:border-accent/50 hover:bg-accent/[.18]"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={() => setEditando(editando === i ? null : i)}
              aria-label={`Filtro ${LABELS[c.campo]}: ${valorTexto(c)}`}
            >
              <span className="text-[11px] text-muted">{LABELS[c.campo]}</span>
              <span className="ml-auto truncate text-[12px] font-semibold text-ink">{valorTexto(c)}</span>
            </button>

            {editando === i && (c.op === 'entre' || c.op === 'en' || c.op === 'no_en') && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-accent/20 pt-2">
                {c.op === 'entre' ? (
                  <>
                    <input
                      type="number"
                      value={c.desde}
                      onChange={(e) => actualizar(i, { ...c, desde: Number(e.target.value) })}
                      className="w-20"
                    />
                    <span className="text-muted">a</span>
                    <input
                      type="number"
                      value={c.hasta}
                      onChange={(e) => actualizar(i, { ...c, hasta: Number(e.target.value) })}
                      className="w-20"
                    />
                  </>
                ) : (
                  <>
                    <select value={c.op} onChange={(e) => actualizar(i, { ...c, op: e.target.value as 'en' | 'no_en' })}>
                      <option value="en">es</option>
                      <option value="no_en">no es</option>
                    </select>
                    <select
                      multiple
                      value={c.valores}
                      onChange={(e) => actualizar(i, { ...c, valores: Array.from(e.target.selectedOptions, (o) => o.value) })}
                      className="w-full"
                    >
                      {(opciones[c.campo as (typeof CAMPOS_TEXTO)[number]] ?? []).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}

            <button type="button" className="mt-1 text-[11px] text-faint hover:text-ink" onClick={() => quitar(i)}>
              quitar
            </button>
          </div>
        ))}
      </div>

      {(textoDisponible.length > 0 || rangoDisponible.length > 0) && (
        <div className="mt-[18px] flex flex-col gap-[11px] border-t border-line pt-4">
          <div className="text-[12px] text-faint">Añadir filtro manual</div>
          {textoDisponible.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => agregarTexto(c)}
              className={cn(
                'rounded-lg border border-dashed border-line-strong px-[11px] py-2 text-center text-[12px] text-ink-soft',
                'hover:border-accent/40 hover:text-ink',
              )}
            >
              {LABELS[c]}
            </button>
          ))}
          {rangoDisponible.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => agregarRango(c)}
              className={cn(
                'rounded-lg border border-dashed border-line-strong px-[11px] py-2 text-center text-[12px] text-ink-soft',
                'hover:border-accent/40 hover:text-ink',
              )}
            >
              {LABELS[c]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-[18px] flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[12px]">
        <span className="text-muted">Orden</span>
        <select
          value={value.orden?.campo ?? ''}
          onChange={(e) => {
            const campo = e.target.value as CampoSegmentoNumerico | '';
            onChange({ ...value, orden: campo ? { campo, dir: value.orden?.dir ?? 'desc' } : undefined });
          }}
          className="w-full"
        >
          <option value="">sin orden</option>
          {CAMPOS_RANGO.map((c) => (
            <option key={c} value={c}>
              {LABELS[c]}
            </option>
          ))}
        </select>
        {value.orden && (
          <select
            value={value.orden.dir}
            onChange={(e) => onChange({ ...value, orden: { ...value.orden!, dir: e.target.value as 'asc' | 'desc' } })}
            className="w-full"
          >
            <option value="desc">mayor a menor</option>
            <option value="asc">menor a mayor</option>
          </select>
        )}
        <span className="text-muted">Límite</span>
        <input
          type="number"
          value={value.limite ?? ''}
          onChange={(e) => onChange({ ...value, limite: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })}
          className="w-full"
          placeholder="sin límite"
        />
      </div>
    </div>
  );
}
