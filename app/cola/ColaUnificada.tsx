'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '../ui/cn';
import { Chip } from '../ui/Chip';
import { CanalDot } from '../ui/CanalTag';
import { CANAL_DOT_HALO } from '../ui/canal-tag.variants.ts';
import { pillParaEstado } from '../ui/pill.variants.ts';
import { SeverityText } from '../ui/SeverityText';
import { FilaAcciones } from './AgendaHoy';
import {
  aplicarFiltrosUnificados,
  type FilaUnificada,
  type FiltrosUnificados,
  type Bucket,
  type Frescura,
  type FiltroCanal,
} from './agenda.ts';

const BUCKET_LABEL: Record<Bucket, string> = { lead: 'Lead', cierre: 'Cierre', reagendar: 'Reagendar' };
const FRESCURA_LABEL: Record<Frescura, string> = { vigente: 'Vigente', desactualizado: 'Desactualizado', sin_fecha: 'Sin fecha' };

const FILTROS_INICIALES: FiltrosUnificados = { bucket: 'todos', campana: 'todas', canal: 'todos', frescura: 'todas' };

export function ColaUnificada({
  filas,
  registrarTapAction,
}: {
  filas: FilaUnificada[];
  registrarTapAction: (formData: FormData) => void | Promise<void>;
}) {
  const [filtros, setFiltros] = useState<FiltrosUnificados>(FILTROS_INICIALES);
  const visibles = aplicarFiltrosUnificados(filas, filtros);
  const campanas = [...new Set(filas.map((f) => f.campana).filter((c): c is string => c != null))].sort();

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex-1 overflow-hidden rounded-xl border border-line-card bg-card">
        <div className="flex items-center justify-between gap-3 px-7 pt-6 pb-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-faint">Tus toques</span>
          <span className="text-xs text-faint">
            {visibles.length} de {filas.length}
          </span>
        </div>

        <div className="mx-7 h-px bg-line-card" />

        {visibles.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-muted">Nada con estos filtros.</div>
        ) : (
          <div className="flex flex-col gap-2 px-4 py-4">
            {visibles.map((fila, i) => {
              const pill = pillParaEstado(fila.estado);
              return (
                <div
                  key={fila.id}
                  className={cn(
                    'group relative flex items-center gap-1 rounded-xl border border-line-card bg-surface-2 transition-colors duration-150 hover:border-accent-soft hover:bg-card-hover',
                    fila.actual && 'border-border-accent bg-surface-hi hover:bg-surface-hi',
                  )}
                >
                  <Link href={`/llamada/${fila.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-3 py-3.5">
                    <div className={cn('w-8 flex-shrink-0 text-sm tabular-nums', fila.actual ? 'font-serif text-base leading-none text-ink' : 'text-muted')}>
                      {i + 1}
                    </div>
                    <CanalDot canal={fila.canal} className={cn(fila.actual && CANAL_DOT_HALO[fila.canal])} />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className={cn('truncate text-sm', fila.actual ? 'font-semibold text-ink' : 'font-medium text-ink-soft')}>
                        {fila.empresa}
                      </span>
                      {fila.pbxForma && (
                        <span
                          className="shrink-0 rounded-[6px] border border-line-card bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint"
                          title="Bucle PBX: sin decisor alcanzable todavía"
                        >
                          PBX
                        </span>
                      )}
                      {fila.origen === 'cadencia' && (
                        <span
                          className="shrink-0 rounded-[6px] border border-accent-soft bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-acento"
                          title="Paso de cadencia (Apollo/manual), no un lead nuevo"
                        >
                          Cadencia
                        </span>
                      )}
                      {(pill || fila.ciudad || fila.campana) && (
                        <span className="shrink-0 truncate text-xs text-faint">
                          · {[pill?.label, fila.ciudad, fila.campana].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    {fila.actual ? (
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-acento">Ahora</span>
                    ) : fila.frescura === 'desactualizado' ? (
                      <span className="shrink-0 text-xs text-faint">desactualizado</span>
                    ) : (
                      <SeverityText variant={fila.sev} className="shrink-0 text-xs">
                        {fila.severidadTexto}
                      </SeverityText>
                    )}
                  </Link>
                  <FilaAcciones idEmpresa={fila.id} registrarTapAction={registrarTapAction} />
                </div>
              );
            })}
          </div>
        )}

        <div className="pb-4" />
      </div>

      <div className="w-full shrink-0 space-y-5 lg:w-64">
        <FiltroGrupo
          titulo="Etapa"
          opciones={[{ v: 'todos' as const, l: 'Todos' }, ...(['lead', 'cierre', 'reagendar'] as Bucket[]).map((b) => ({ v: b, l: BUCKET_LABEL[b] }))]}
          valor={filtros.bucket}
          onChange={(bucket) => setFiltros((f) => ({ ...f, bucket }))}
        />
        {campanas.length > 0 && (
          <FiltroGrupo
            titulo="Campaña"
            opciones={[{ v: 'todas' as const, l: 'Todas' }, ...campanas.map((c) => ({ v: c, l: c }))]}
            valor={filtros.campana}
            onChange={(campana) => setFiltros((f) => ({ ...f, campana }))}
          />
        )}
        <FiltroGrupo
          titulo="Canal"
          opciones={[
            { v: 'todos' as const, l: 'Todos' },
            { v: 'llamada' as const, l: 'Llamadas' },
            { v: 'correo' as const, l: 'Correos' },
            { v: 'whatsapp' as const, l: 'WhatsApp' },
          ] satisfies { v: FiltroCanal; l: string }[]}
          valor={filtros.canal}
          onChange={(canal) => setFiltros((f) => ({ ...f, canal }))}
        />
        <FiltroGrupo
          titulo="Frescura"
          opciones={[{ v: 'todas' as const, l: 'Todas' }, ...(['vigente', 'desactualizado'] as Frescura[]).map((fr) => ({ v: fr, l: FRESCURA_LABEL[fr] }))]}
          valor={filtros.frescura}
          onChange={(frescura) => setFiltros((f) => ({ ...f, frescura }))}
        />
      </div>
    </div>
  );
}

function FiltroGrupo<T extends string>({
  titulo,
  opciones,
  valor,
  onChange,
}: {
  titulo: string;
  opciones: { v: T; l: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">{titulo}</div>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => (
          <Chip key={o.v} tone="accent" on={valor === o.v} onClick={() => onChange(o.v)}>
            {o.l}
          </Chip>
        ))}
      </div>
    </div>
  );
}
