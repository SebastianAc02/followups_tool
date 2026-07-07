'use client';

import { useState, useTransition } from 'react';
import { recalcularConteosAction, guardarReglaFaltanteAction } from './actions';
import type { ConteosReadiness } from '../../../db/repository';
import type { ReglaFaltante } from '../../../core/canales-empresa';
import { cn } from '../../../ui/cn';

type Opcion = { regla: ReglaFaltante; titulo: string; explicacion: string };

// Calca el lenguaje del banner "Regla activa" y las tarjetas de opcion del Copiloto
// en los mockups de Arc (Cockpit Destinatarios / HTML 2 Segmentacion): titulo corto
// + una linea de explicacion en lenguaje de dominio, no el nombre tecnico del enum.
const OPCIONES: Opcion[] = [
  {
    regla: 'reemplazar',
    titulo: 'Reemplazar por otro canal',
    explicacion: 'Si a la cuenta le falta el canal del paso (ej. correo), el toque sale igual por el primer canal disponible (ej. llamada).',
  },
  {
    regla: 'saltar',
    titulo: 'Saltar el paso',
    explicacion: 'El paso se salta para esa cuenta. La cadencia sigue con el siguiente toque que sí tenga canal disponible.',
  },
  {
    regla: 'cola',
    titulo: 'Dejar en cola de revisión',
    explicacion: 'La cuenta queda pendiente de revisión manual — no se le envía nada hasta que alguien decida qué hacer con ella.',
  },
];

export function ReglasCockpit({
  idCampana,
  nombre,
  reglaGuardada,
  conteosIniciales,
}: {
  idCampana: number;
  nombre: string;
  reglaGuardada: ReglaFaltante;
  conteosIniciales: ConteosReadiness;
}) {
  const [seleccion, setSeleccion] = useState<ReglaFaltante>(reglaGuardada);
  const [conteos, setConteos] = useState(conteosIniciales);
  const [guardada, setGuardada] = useState(reglaGuardada);
  const [error, setError] = useState('');
  const [pendienteCalculo, startCalculo] = useTransition();
  const [pendienteGuardar, startGuardar] = useTransition();

  const hayCambios = seleccion !== guardada;

  function elegir(regla: ReglaFaltante) {
    if (regla === seleccion) return;
    setSeleccion(regla);
    setError('');
    startCalculo(async () => {
      const res = await recalcularConteosAction(idCampana, regla);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConteos(res.conteos);
    });
  }

  function guardar() {
    setError('');
    startGuardar(async () => {
      const res = await guardarReglaFaltanteAction(idCampana, seleccion);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setGuardada(seleccion);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono-tag text-xs uppercase tracking-widest text-muted">Campaña · Reglas</p>
        <h1 className="font-serif text-2xl text-ink">{nombre}</h1>
        <p className="text-[13px] text-muted">Qué hacer cuando a una cuenta le falta el canal que le toca en un paso.</p>
      </header>

      <section className="rounded-[18px] border border-line bg-card px-6 py-6" aria-labelledby="conteos-vivo">
        <h2 id="conteos-vivo" className="mb-1 font-serif text-xl text-ink">
          Efecto sobre las cuentas
        </h2>
        <p className="mb-5 text-[13px] text-muted">Se recalcula al tocar cada opción, antes de guardar nada.</p>

        <div className={cn('grid grid-cols-3 gap-3.5 transition-opacity', pendienteCalculo && 'opacity-60')}>
          <ConteoStat value={conteos.listas} label="listas" tone="done" />
          <ConteoStat value={conteos.parciales} label="con ajuste" tone="today" />
          <ConteoStat value={conteos.sinCanal} label="bloqueadas" tone="overdue" />
        </div>
        <p className="mt-4 text-xs text-faint">
          De {conteos.total} cuentas del segmento · {conteos.sinContacto} sin ningún contacto (ni correo ni teléfono).
        </p>
      </section>

      <section className="rounded-[18px] border border-line bg-card px-6 py-6" aria-labelledby="opciones-regla">
        <h2 id="opciones-regla" className="mb-1 font-serif text-xl text-ink">
          Elige la regla
        </h2>
        <p className="mb-5 text-[13px] text-muted">Aplica a todos los pasos de la cadencia donde falte el canal correspondiente.</p>

        <div className="flex flex-col gap-3">
          {OPCIONES.map((op) => {
            const activa = seleccion === op.regla;
            return (
              <button
                key={op.regla}
                type="button"
                onClick={() => elegir(op.regla)}
                className={cn(
                  'rounded-[13px] border px-[18px] py-4 text-left transition-colors',
                  activa ? 'border-accent/40 bg-accent-bg' : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <div className="mb-1.5 flex items-center gap-2.5">
                  <span
                    className={cn('block h-2.5 w-2.5 shrink-0 rounded-full', activa ? 'bg-accent' : 'bg-faint')}
                    aria-hidden="true"
                  />
                  <span className={cn('text-sm font-semibold', activa ? 'text-accent-ink' : 'text-ink')}>{op.titulo}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-muted">{op.explicacion}</p>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 text-xs text-overdue">{error}</p>}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={guardar}
            disabled={!hayCambios || pendienteGuardar}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
          >
            {pendienteGuardar ? 'Guardando…' : 'Guardar regla'}
          </button>
          {!hayCambios && <span className="text-xs text-faint">Esta es la regla activa hoy.</span>}
          {hayCambios && !pendienteGuardar && <span className="text-xs text-muted">Sin guardar todavía.</span>}
        </div>
      </section>
    </div>
  );
}

function ConteoStat({ value, label, tone }: { value: number; label: string; tone: 'done' | 'today' | 'overdue' }) {
  const toneClass = { done: 'text-done', today: 'text-today', overdue: 'text-overdue' }[tone];
  return (
    <div className="rounded-[13px] border border-line bg-surface px-4 py-4">
      <span className={cn('block font-serif text-3xl tracking-tight', toneClass)}>{value}</span>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}
