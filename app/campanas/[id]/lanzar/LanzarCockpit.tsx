'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  recalcularGoteoAction,
  guardarConfigLanzamientoAction,
  lanzarCampanaAction,
  cargaGlobalHoyAction,
} from './actions';
import type { CampanaParaLanzar } from '../../../db/repository';
import type { ResultadoGoteo, RitmoIngreso } from '../../../core/goteo';
import { fechaLocalISO } from '../../../lib/date-utils';
import { Seg, SegButton } from '../../../ui/Seg';
import { cn } from '../../../ui/cn';

const RITMO_LABEL: Record<RitmoIngreso, string> = {
  diario: 'Todos los días',
  dia_si_dia_no: 'Día sí, día no',
  personalizado: 'Personalizado',
};

// Fase 8 (V6 Lanzar): calca "Lanzar Cockpit html6/index.html" -- dos columnas, izquierda
// controles (cuando + distribucion diaria), derecha resumen (barra D1..D9, carga global
// informativa, prueba no-op, boton Lanzar). Todo el calculo de la barra es en el cliente
// via recalcularGoteoAction (debounce simple con useEffect) para que se sienta "en vivo"
// igual que Reglas (Fase 5) recalcula conteos al tocar una opcion.
export function LanzarCockpit({
  campanaInicial,
  cargaGlobalInicial,
}: {
  campanaInicial: CampanaParaLanzar;
  cargaGlobalInicial: { totalHoy: number; campanasActivas: number };
}) {
  const router = useRouter();
  const hoy = fechaLocalISO(new Date());

  const [programar, setProgramar] = useState(!!campanaInicial.fechaInicio && campanaInicial.fechaInicio !== hoy);
  const [fechaInicio, setFechaInicio] = useState(campanaInicial.fechaInicio ?? hoy);
  const [intakeDiario, setIntakeDiario] = useState(campanaInicial.intakeDiario ?? 20);
  const [ritmoIngreso, setRitmoIngreso] = useState<RitmoIngreso>(campanaInicial.ritmoIngreso as RitmoIngreso);
  const [topeToquesDia, setTopeToquesDia] = useState(campanaInicial.topeToquesDia ?? 40);

  const [goteo, setGoteo] = useState<ResultadoGoteo | null>(null);
  const [cargaGlobal, setCargaGlobal] = useState(cargaGlobalInicial);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<{ inscritas: number; bloqueadas: number } | null>(null);
  const [avisoSecuenciaExterna, setAvisoSecuenciaExterna] = useState('');
  const [pendienteCalculo, startCalculo] = useTransition();
  const [pendienteLanzar, startLanzar] = useTransition();

  const fechaEfectiva = programar ? fechaInicio : hoy;

  useEffect(() => {
    setError('');
    startCalculo(async () => {
      const res = await recalcularGoteoAction(campanaInicial.idCampana, {
        intakeDiario,
        ritmoIngreso,
        fechaInicio: fechaEfectiva,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setGoteo(res.goteo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intakeDiario, ritmoIngreso, fechaEfectiva, campanaInicial.idCampana]);

  useEffect(() => {
    let vivo = true;
    cargaGlobalHoyAction().then((res) => {
      if (vivo && res.ok) setCargaGlobal({ totalHoy: res.totalHoy, campanasActivas: res.campanasActivas });
    });
    return () => {
      vivo = false;
    };
  }, []);

  function lanzar() {
    setError('');
    startLanzar(async () => {
      const primero = await guardarConfigLanzamientoAction(campanaInicial.idCampana, {
        intakeDiario,
        ritmoIngreso,
        topeToquesDia,
        fechaInicio: programar ? fechaInicio : null,
      });
      if (!primero.ok) {
        setError(primero.error);
        return;
      }
      const res = await lanzarCampanaAction(campanaInicial.idCampana, {
        intakeDiario,
        ritmoIngreso,
        topeToquesDia,
        fechaInicio: programar ? fechaInicio : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResultado({ inscritas: res.resultado.inscritas, bloqueadas: res.resultado.bloqueadas });
      if (res.avisoSecuenciaExterna) setAvisoSecuenciaExterna(res.avisoSecuenciaExterna);
      router.refresh();
    });
  }

  const primerosDias = (goteo?.porDia ?? []).slice(0, 9);
  const maxCuantos = Math.max(1, ...primerosDias.map((d) => d.cuantos));
  const entranHoy = goteo?.porDia[0]?.cuantos ?? 0;
  const enCola = campanaInicial.totalElegibles - (goteo?.porDia.reduce((acc, d) => acc + d.cuantos, 0) ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono-tag text-xs uppercase tracking-widest text-muted">Campaña · Lanzar</p>
        <h1 className="font-serif text-2xl text-ink">{campanaInicial.nombre}</h1>
        <p className="text-[13px] text-muted">Ya revisaste el resumen. Solo queda el cuándo y a qué ritmo entran los contactos.</p>
      </header>

      {resultado ? (
        <section className="rounded-[18px] border border-line bg-card px-6 py-8 text-center">
          <p className="font-serif text-xl text-ink">Campaña lanzada</p>
          <p className="mt-2 text-sm text-muted">
            {resultado.inscritas} {resultado.inscritas === 1 ? 'cuenta entró' : 'cuentas entraron'} a la secuencia
            {resultado.bloqueadas > 0 && ` · ${resultado.bloqueadas} quedaron en cola de revisión`}.
          </p>
          {avisoSecuenciaExterna && <p className="mt-3 text-sm text-amber-600">{avisoSecuenciaExterna}</p>}
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Columna izquierda: controles */}
          <section className="flex flex-col gap-8 rounded-[18px] border border-line bg-card px-6 py-6">
            <div>
              <p className="mb-3 font-mono-tag text-xs uppercase tracking-widest text-muted">¿Cuándo?</p>
              <Seg>
                <SegButton on={!programar} onClick={() => setProgramar(false)}>
                  Lanzar hoy
                </SegButton>
                <SegButton on={programar} onClick={() => setProgramar(true)}>
                  Programar para un día
                </SegButton>
              </Seg>
              {programar ? (
                <input
                  type="date"
                  value={fechaInicio}
                  min={hoy}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              ) : (
                <p className="text-xs text-muted">La cadencia arranca hoy con el primer grupo.</p>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <p className="font-mono-tag text-xs uppercase tracking-widest text-muted">Distribución diaria</p>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-ink">Contactos que entran por día</span>
                  <Stepper
                    value={intakeDiario}
                    min={1}
                    onChange={setIntakeDiario}
                    ariaLabelPrefix="contactos por día"
                  />
                </div>
                <input
                  type="range"
                  min={1}
                  max={Math.max(50, campanaInicial.totalElegibles || 50)}
                  value={intakeDiario}
                  onChange={(e) => setIntakeDiario(Number(e.target.value))}
                  className="w-full accent-accent"
                  aria-label="Contactos que entran por día"
                />
              </div>

              <div>
                <p className="mb-3 text-sm text-ink">Ritmo</p>
                <Seg>
                  <SegButton on={ritmoIngreso === 'diario'} onClick={() => setRitmoIngreso('diario')}>
                    {RITMO_LABEL.diario}
                  </SegButton>
                  <SegButton on={ritmoIngreso === 'dia_si_dia_no'} onClick={() => setRitmoIngreso('dia_si_dia_no')}>
                    {RITMO_LABEL.dia_si_dia_no}
                  </SegButton>
                  <SegButton on={ritmoIngreso === 'personalizado'} onClick={() => setRitmoIngreso('personalizado')}>
                    {RITMO_LABEL.personalizado}
                  </SegButton>
                </Seg>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink">Máximo de toques por día</p>
                  <p className="mt-0.5 text-xs text-muted">El Copiloto espacia los envíos para no pasarse.</p>
                </div>
                <Stepper value={topeToquesDia} min={1} onChange={setTopeToquesDia} ariaLabelPrefix="máximo de toques" />
              </div>
            </div>

            {error && <p className="text-xs text-overdue">{error}</p>}
          </section>

          {/* Columna derecha: resumen */}
          <aside className="flex flex-col gap-5 rounded-[18px] border border-line bg-card px-5 py-5">
            <div>
              <p className="mb-4 font-mono-tag text-xs uppercase tracking-widest text-muted">Así se distribuye</p>
              <div className={cn('flex items-end gap-2 transition-opacity', pendienteCalculo && 'opacity-60')} style={{ height: 96 }}>
                {primerosDias.length === 0 && (
                  <p className="text-xs text-muted">Sin destinatarios elegibles todavía.</p>
                )}
                {primerosDias.map((d, i) => (
                  <div key={d.fecha} className="flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height: '100%' }}>
                    <span className="font-mono-tag text-[10px] text-accent-ink">{d.cuantos > 0 ? d.cuantos : ''}</span>
                    <div
                      className="w-full rounded-t-md rounded-b-sm"
                      style={{
                        height: `${Math.max(9, (d.cuantos / maxCuantos) * 100)}%`,
                        background: d.cuantos > 0 ? 'linear-gradient(180deg, var(--color-accent), var(--color-accent))' : 'rgba(255,255,255,0.06)',
                      }}
                    />
                    <span className="font-mono-tag text-[9px] text-faint">D{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[13px] leading-relaxed text-muted">
              A {intakeDiario} por día{ritmoIngreso === 'dia_si_dia_no' ? ', día sí y día no,' : ''} los{' '}
              <span className="font-semibold text-ink">{entranHoy}</span> contactos listos entran{' '}
              {programar ? `el ${fechaInicio}` : 'hoy'}. En un segmento de {campanaInicial.totalElegibles} tardarías{' '}
              <span className="font-semibold text-ink">{goteo?.diasHabiles ?? 0} días hábiles</span> en inscribirlos a todos.
            </p>

            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted">
              Carga total hoy entre las {cargaGlobal.campanasActivas} campañas activas:{' '}
              <span className="font-semibold text-ink">{cargaGlobal.totalHoy} toques</span>. Informativo — no bloquea el
              lanzamiento.
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg bg-canal-correo/15 text-canal-correo" aria-hidden="true">
                ✈
              </span>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-ink">Envía una prueba</p>
                <p className="text-xs text-muted">Recibe la secuencia antes de lanzar.</p>
              </div>
              <button
                type="button"
                disabled
                title="Todavía no hay backend de envío de prueba"
                className="whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-xs text-muted opacity-50"
              >
                Probar
              </button>
            </div>

            <div className="mt-auto">
              <button
                type="button"
                onClick={lanzar}
                disabled={pendienteLanzar || campanaInicial.totalElegibles === 0}
                className="w-full rounded-xl bg-accent py-4 text-sm font-bold text-bg transition-opacity disabled:opacity-40"
              >
                {pendienteLanzar ? 'Lanzando…' : programar ? 'Programar lanzamiento' : 'Lanzar hoy'}
              </button>
              <p className="mt-3 text-center text-xs text-muted">
                Entran {entranHoy} contactos {programar ? 'el día programado' : 'hoy'} · {Math.max(0, enCola)} cuentas quedan en cola.
                <br />
                Los toques marcados como Revisar pasan a <span className="text-accent-ink">Por revisar</span> y salen solo
                cuando los apruebes.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Stepper({
  value,
  min,
  onChange,
  ariaLabelPrefix,
}: {
  value: number;
  min: number;
  onChange: (v: number) => void;
  ariaLabelPrefix: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`Reducir ${ariaLabelPrefix}`}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-line text-muted hover:border-line-strong"
      >
        −
      </button>
      <span className="min-w-[30px] text-center font-mono-tag text-xl text-ink">{value}</span>
      <button
        type="button"
        aria-label={`Aumentar ${ariaLabelPrefix}`}
        onClick={() => onChange(value + 1)}
        className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-line text-muted hover:border-line-strong"
      >
        +
      </button>
    </div>
  );
}
