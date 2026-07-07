'use client';

import { useState, useTransition } from 'react';
import { editarCopyPasoAction } from './actions';
import { CanalTag, type Canal } from '../../ui/CanalTag';
import { cn } from '../../ui/cn';

export type PasoCadenciaUI = {
  idPaso: number;
  orden: number;
  diaOffset: number;
  canal: string;
  objetivo: string | null;
  idVersion: number | null;
  asunto: string | null;
  cuerpo: string | null;
  firmaApollo: boolean;
  variables: string[];
};

const CANALES: Canal[] = ['correo', 'llamada', 'whatsapp'];

const CANAL_CHIP_ON: Record<Canal, string> = {
  correo: 'border-canal-correo/40 bg-canal-correo/10 text-canal-correo',
  llamada: 'border-canal-llamada/40 bg-canal-llamada/10 text-canal-llamada',
  whatsapp: 'border-canal-whatsapp/40 bg-canal-whatsapp/10 text-canal-whatsapp',
};

const CANAL_DOT: Record<Canal, string> = {
  correo: 'bg-canal-correo',
  llamada: 'bg-canal-llamada',
  whatsapp: 'bg-canal-whatsapp',
};

function conVariablesResaltadas(texto: string) {
  const partes = texto.split(/(\[[^[\]]+\])/g);
  return partes.map((parte, i) =>
    /^\[[^[\]]+\]$/.test(parte) ? (
      <span key={i} className="rounded-[4px] bg-accent-bg px-[5px] py-px text-[0.92em] text-accent-ink">
        {parte}
      </span>
    ) : (
      <span key={i}>{parte}</span>
    ),
  );
}

// Fase 4: esManual, dia y canal no tienen action de escritura en el repository
// todavia (crearCadencia solo escribe al crear; no hay actualizarPasoCadencia). El
// toggle/selector queda en estado local con esta bandera visible, en vez de fingir
// que persiste — reportado a Sebastian como gap real, no se improvisa la escritura
// aca porque tocaria app/db/repository.ts (fuera de alcance, otro agente lo usa).
const PERSISTENCIA_PENDIENTE = 'Cambio visual — falta action del repository para guardarlo';

export function CadenciaCockpit({ idCadencia, nombre, pasos }: { idCadencia: number; nombre: string; pasos: PasoCadenciaUI[] }) {
  const [filas, setFilas] = useState(
    pasos.map((p) => ({ ...p, esManualLocal: false })),
  );
  const [editando, setEditando] = useState<number | null>(null);

  function setCanalLocal(idPaso: number, canal: Canal) {
    setFilas((fs) => fs.map((f) => (f.idPaso === idPaso ? { ...f, canal } : f)));
  }

  function toggleAprobacionLocal(idPaso: number) {
    setFilas((fs) => fs.map((f) => (f.idPaso === idPaso ? { ...f, esManualLocal: !f.esManualLocal } : f)));
  }

  function setDiaLocal(idPaso: number, diaOffset: number) {
    setFilas((fs) => fs.map((f) => (f.idPaso === idPaso ? { ...f, diaOffset } : f)));
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono-tag text-xs uppercase tracking-widest text-muted">Cadencia</p>
        <h1 className="font-serif text-2xl text-ink">{nombre}</h1>
      </header>

      <section className="rounded-[18px] border border-line bg-card px-6 py-6" aria-labelledby="arma-tu-cadencia">
        <h2 id="arma-tu-cadencia" className="mb-1 font-serif text-xl text-ink">
          Arma tu cadencia
        </h2>
        <p className="mb-5 text-[13px] text-muted">
          Define cada toque de forma explícita: número, día y canal. Marca los que quieras revisar y aprobar antes de que se envíen.
        </p>

        <div className="grid grid-cols-[88px_140px_1fr_160px] gap-3.5 px-1 pb-2 font-mono-tag text-[10px] uppercase tracking-widest text-faint">
          <span>Toque</span>
          <span>Día de envío</span>
          <span>Canal</span>
          <span>Aprobación</span>
        </div>

        <div className="flex flex-col">
          {filas.map((f, i) => (
            <div key={f.idPaso} className="grid grid-cols-[88px_140px_1fr_160px] items-center gap-3.5 border-t border-line/60 px-1 py-2 first:border-t-0">
              <span className="text-sm font-semibold text-ink">Toque {i + 1}</span>

              <label className="flex items-center gap-2 rounded-[9px] border border-line bg-surface px-3 py-2 text-sm">
                <span className="text-[11px] text-faint">Día</span>
                <input
                  type="number"
                  min={0}
                  value={f.diaOffset}
                  onChange={(e) => setDiaLocal(f.idPaso, Number(e.target.value) || 0)}
                  className="w-full bg-transparent font-mono-tag text-ink outline-none"
                  title={PERSISTENCIA_PENDIENTE}
                />
              </label>

              <div className="flex gap-1.5">
                {CANALES.map((canal) => (
                  <button
                    key={canal}
                    type="button"
                    onClick={() => setCanalLocal(f.idPaso, canal)}
                    title={PERSISTENCIA_PENDIENTE}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                      f.canal === canal ? CANAL_CHIP_ON[canal] : 'border-line text-muted hover:text-ink',
                    )}
                  >
                    {canal === 'correo' ? 'Correo' : canal === 'llamada' ? 'Llamada' : 'WhatsApp'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => toggleAprobacionLocal(f.idPaso)}
                title={PERSISTENCIA_PENDIENTE}
                className={cn(
                  'inline-flex w-fit items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  f.esManualLocal
                    ? 'border-accent/40 bg-accent-bg text-accent-ink'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                {f.esManualLocal ? '✦ Revisar' : 'Automático'}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled
          title={PERSISTENCIA_PENDIENTE}
          className="mt-3 w-full rounded-[11px] border border-dashed border-line px-3 py-3 text-[13px] text-muted opacity-60"
        >
          + Añadir toque
        </button>
      </section>

      <section className="rounded-[18px] border border-line bg-card px-6 py-6" aria-labelledby="cadencia-por-pasos">
        <h2 id="cadencia-por-pasos" className="mb-1 font-serif text-xl text-ink">
          Tu cadencia por pasos
        </h2>
        <p className="mb-6 text-[13px] text-muted">
          Se genera desde los toques de arriba. Así la verá cada cuenta, con las variables ya resueltas. Toca un paso para editarlo.
        </p>

        <div className="flex flex-col">
          {filas.map((paso, i) => (
            <PasoTimelineItem
              key={paso.idPaso}
              paso={paso}
              esUltimo={i === filas.length - 1}
              idCadencia={idCadencia}
              editando={editando === paso.idPaso}
              onEditar={() => setEditando(paso.idPaso)}
              onCerrar={() => setEditando(null)}
            />
          ))}
        </div>

        <button
          type="button"
          disabled
          title={PERSISTENCIA_PENDIENTE}
          className="mt-2 w-full rounded-[11px] border border-dashed border-line px-3 py-3 text-[13px] text-muted opacity-60"
        >
          + Añadir paso
        </button>
      </section>
    </div>
  );
}

function PasoTimelineItem({
  paso,
  esUltimo,
  idCadencia,
  editando,
  onEditar,
  onCerrar,
}: {
  paso: PasoCadenciaUI & { esManualLocal: boolean };
  esUltimo: boolean;
  idCadencia: number;
  editando: boolean;
  onEditar: () => void;
  onCerrar: () => void;
}) {
  const [asunto, setAsunto] = useState(paso.asunto ?? '');
  const [cuerpo, setCuerpo] = useState(paso.cuerpo ?? '');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const canal = (['correo', 'llamada', 'whatsapp'] as const).includes(paso.canal as Canal) ? (paso.canal as Canal) : null;

  function guardar() {
    setError('');
    startTransition(async () => {
      const res = await editarCopyPasoAction(paso.idPaso, asunto, cuerpo, idCadencia);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCerrar();
    });
  }

  return (
    <div className="flex gap-4">
      <div className="flex w-[52px] shrink-0 flex-col items-center">
        <div className="mb-2 whitespace-nowrap font-mono-tag text-[11px] text-muted">Día {paso.diaOffset}</div>
        <span className={cn('block h-3 w-3 rounded-full', canal ? CANAL_DOT[canal] : 'bg-faint')} />
        {!esUltimo && <span className="my-1.5 min-h-[34px] w-0.5 flex-1 bg-line/60" />}
      </div>

      <div className="mb-4 flex-1 rounded-[13px] border border-line bg-surface px-[18px] py-4 transition-colors hover:border-line-strong">
        <div className="mb-2.5 flex items-center gap-2.5">
          {canal ? <CanalTag canal={canal} /> : <span className="text-[11px] font-medium text-muted">{paso.canal}</span>}
          <span className="font-mono-tag text-xs text-faint">Paso {paso.orden}</span>
          {!editando && (
            <button type="button" onClick={onEditar} className="ml-auto text-xs font-medium text-accent-soft hover:text-accent">
              Editar
            </button>
          )}
        </div>

        {editando ? (
          <div className="flex flex-col gap-2.5">
            <input
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Asunto (opcional)"
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={4}
              placeholder="Cuerpo"
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            {error && <p className="text-xs text-overdue">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={guardar}
                disabled={pending}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-60"
              >
                {pending ? 'Guardando…' : 'Guardar como versión nueva'}
              </button>
              <button type="button" onClick={onCerrar} className="text-xs font-medium text-muted hover:text-ink">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            {paso.asunto && (
              <p className="mb-1.5 text-sm font-medium text-ink">Asunto: {conVariablesResaltadas(paso.asunto)}</p>
            )}
            {paso.cuerpo ? (
              <p className="text-[13px] leading-relaxed text-ink-soft">{conVariablesResaltadas(paso.cuerpo)}</p>
            ) : (
              <p className="text-[13px] text-faint">(sin copy)</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
