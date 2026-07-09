'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { editarCopyPasoAction, actualizarPasoCadenciaAction, agregarPasoCadenciaAction, eliminarPasoCadenciaAction } from './actions';
import { CanalTag, type Canal } from '../../ui/CanalTag';
import { CANAL_LABEL } from '../../ui/canal-tag.variants.ts';
import { cn } from '../../ui/cn';
import { useConfirm } from '../../ui/useConfirm';

export type PasoCadenciaUI = {
  idPaso: number;
  orden: number;
  diaOffset: number;
  canal: string;
  objetivo: string | null;
  esManual: boolean;
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

// Una sola vista, siempre las dos partes (grid + secuencia): se probo ocultar el
// grid durante la creacion (mostrarConstructor=false) y Sebastian volvio a pedir una
// unica vista consistente en todos lados -- la de las dos partes se ve mas terminada
// que la de solo secuencia a medias.
export function CadenciaCockpit({
  idCadencia,
  nombre,
  pasos,
  idCampanaBorrador,
}: {
  idCadencia: number;
  nombre: string;
  pasos: PasoCadenciaUI[];
  // Presente solo cuando esta cadencia pertenece a una campaña en borrador (Fix 8):
  // habilita el CTA de avance, igual que los otros pasos del wizard de creación.
  idCampanaBorrador?: number;
}) {
  const [filas, setFilas] = useState(pasos);
  const [editando, setEditando] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [addPending, startAddTransition] = useTransition();
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const { confirmar, elemento: dialogoConfirmar } = useConfirm();

  // Optimista + revert: pinta el cambio ya, y si la action falla vuelve al valor previo
  // y muestra el error. Mismo patron try/catch que PasoTimelineItem.guardar(), pero acá
  // el estado optimista evita que cada click en un chip espere el roundtrip del server.
  function guardarCambio(idPaso: number, cambios: { diaOffset?: number; canal?: Canal; esManual?: boolean }) {
    setError('');
    const previas = filas;
    setFilas((fs) => fs.map((f) => (f.idPaso === idPaso ? { ...f, ...cambios } : f)));
    startTransition(async () => {
      const res = await actualizarPasoCadenciaAction(idPaso, cambios, idCadencia);
      if (!res.ok) {
        setFilas(previas);
        setError(res.error);
      }
    });
  }

  function setCanalLocal(idPaso: number, canal: Canal) {
    guardarCambio(idPaso, { canal });
  }

  function toggleAprobacionLocal(idPaso: number) {
    const fila = filas.find((f) => f.idPaso === idPaso);
    if (!fila) return;
    guardarCambio(idPaso, { esManual: !fila.esManual });
  }

  function setDiaLocal(idPaso: number, diaOffset: number) {
    guardarCambio(idPaso, { diaOffset });
  }

  function actualizarLocal(idPaso: number, cambios: Partial<PasoCadenciaUI>) {
    setFilas((fs) => fs.map((f) => (f.idPaso === idPaso ? { ...f, ...cambios } : f)));
  }

  // Eliminar desde el grid "Arma tu cadencia" (arriba): mismo camino que Eliminar en
  // "Tu cadencia por pasos" (abajo) -- Sebastian pidio que las dos vistas dejen
  // eliminar, no solo una.
  async function eliminarDesdeGrid(idPaso: number, orden: number) {
    const ok = await confirmar({ titulo: `¿Eliminar el toque ${orden}?`, mensaje: 'No se puede deshacer.' });
    if (!ok) return;
    setError('');
    setEliminandoId(idPaso);
    void eliminarPasoCadenciaAction(idPaso, idCadencia).then((res) => {
      setEliminandoId(null);
      if (res.ok) setFilas((fs) => fs.filter((f) => f.idPaso !== idPaso));
      else setError(res.error);
    });
  }

  function agregarPaso() {
    setError('');
    const ultimoDia = filas.length > 0 ? filas[filas.length - 1].diaOffset : 0;
    startAddTransition(async () => {
      const res = await agregarPasoCadenciaAction(idCadencia, {
        diaOffset: ultimoDia + 1,
        canal: 'correo',
        esManual: false,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFilas((fs) => [
        ...fs,
        {
          idPaso: res.idPaso,
          orden: fs.length + 1,
          diaOffset: ultimoDia + 1,
          canal: 'correo',
          objetivo: null,
          esManual: false,
          idVersion: null,
          asunto: null,
          cuerpo: null,
          firmaApollo: false,
          variables: [],
        },
      ]);
    });
  }

  // Correo y WhatsApp se envían tal cual el cuerpo que se escribe aquí -- sin copy no hay
  // qué mandar. Llamada no cuenta: su "guion" es opcional (el owner improvisa en vivo).
  // Gate de avance del wizard: si falta copy en alguno, "Continuar a Destinatarios" queda
  // deshabilitado y se lista cuáles toques hay que completar o eliminar.
  const pasosSinCopy = filas.filter((f) => (f.canal === 'correo' || f.canal === 'whatsapp') && !f.cuerpo?.trim());

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
          {error && <p className="mb-3 text-xs text-overdue">{error}</p>}

          <div className="grid grid-cols-[88px_140px_1fr_160px_28px] gap-3.5 px-1 pb-2 font-mono-tag text-[10px] uppercase tracking-widest text-faint">
            <span>Toque</span>
            <span>Día de envío</span>
            <span>Canal</span>
            <span>Aprobación</span>
            <span />
          </div>

          <div className="flex flex-col">
            {filas.map((f, i) => (
              <div key={f.idPaso} className="grid grid-cols-[88px_140px_1fr_160px_28px] items-center gap-3.5 border-t border-line/60 px-1 py-2 first:border-t-0">
                <span className="text-sm font-semibold text-ink">Toque {i + 1}</span>

                <label className="flex items-center gap-2 rounded-[9px] border border-line bg-surface px-3 py-2 text-sm">
                  <span className="text-[11px] text-faint">Día</span>
                  <input
                    type="number"
                    min={0}
                    value={f.diaOffset}
                    onChange={(e) => setDiaLocal(f.idPaso, Number(e.target.value) || 0)}
                    className="w-full bg-transparent font-mono-tag text-ink outline-none"
                  />
                </label>

                <div className="flex gap-1.5">
                  {CANALES.map((canal) => (
                    <button
                      key={canal}
                      type="button"
                      onClick={() => setCanalLocal(f.idPaso, canal)}
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
                  className={cn(
                    'inline-flex w-fit items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    f.esManual
                      ? 'border-accent/40 bg-accent-bg text-accent-ink'
                      : 'border-line text-muted hover:text-ink',
                  )}
                >
                  {f.esManual ? '✦ Revisar' : 'Automático'}
                </button>

                <button
                  type="button"
                  onClick={() => eliminarDesdeGrid(f.idPaso, i + 1)}
                  disabled={eliminandoId === f.idPaso}
                  title="Eliminar toque"
                  className="justify-self-center text-faint hover:text-overdue disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={agregarPaso}
            disabled={addPending}
            className="mt-3 w-full rounded-[11px] border border-dashed border-line px-3 py-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-60"
          >
            {addPending ? 'Añadiendo…' : '+ Añadir toque'}
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
              onActualizado={(cambios) => actualizarLocal(paso.idPaso, cambios)}
            />
          ))}
        </div>
      </section>

      {idCampanaBorrador != null && (
        <div className="flex flex-col items-start gap-2">
          {pasosSinCopy.length > 0 ? (
            <>
              <button
                type="button"
                disabled
                title="Completa el copy de todos los toques para continuar"
                className="cursor-not-allowed self-start rounded-[9px] bg-accent px-5 py-[10px] text-[13px] font-semibold text-bg opacity-40"
              >
                Continuar a Destinatarios
              </button>
              <p className="max-w-md text-xs text-overdue">
                Falta copy en {pasosSinCopy.map((p) => `Toque ${p.orden} (${CANAL_LABEL[p.canal as Canal] ?? p.canal})`).join(', ')}.
                Agrega el copy de cada toque o elimínalo desde &quot;Arma tu cadencia&quot; para poder continuar.
              </p>
            </>
          ) : (
            <Link
              href={`/campanas/${idCampanaBorrador}/destinatarios`}
              className="self-start rounded-[9px] bg-accent px-5 py-[10px] text-[13px] font-semibold text-bg transition-colors hover:opacity-90"
            >
              Continuar a Destinatarios
            </Link>
          )}
        </div>
      )}
      {dialogoConfirmar}
    </div>
  );
}

// correo/whatsapp/llamada son objetos de copy completamente distintos: correo es el
// unico que lleva asunto, llamada no tiene copy enviable (guion propio + objetivo),
// whatsapp es solo cuerpo. Mostrar/editar los tres igual (como era antes) es lo que
// hacia que cambiar de canal "dejara" un asunto viejo sin sentido para una llamada.
const CUERPO_LABEL: Record<Canal, string> = {
  correo: 'Cuerpo del correo',
  whatsapp: 'Mensaje de WhatsApp',
  llamada: 'Guion / puntos a tocar (opcional)',
};

function PasoTimelineItem({
  paso,
  esUltimo,
  idCadencia,
  editando,
  onEditar,
  onCerrar,
  onActualizado,
}: {
  paso: PasoCadenciaUI;
  esUltimo: boolean;
  idCadencia: number;
  editando: boolean;
  onEditar: () => void;
  onCerrar: () => void;
  onActualizado: (cambios: Partial<PasoCadenciaUI>) => void;
}) {
  const canalActual = (['correo', 'llamada', 'whatsapp'] as const).includes(paso.canal as Canal) ? (paso.canal as Canal) : null;
  const [asunto, setAsunto] = useState(paso.asunto ?? '');
  const [cuerpo, setCuerpo] = useState(paso.cuerpo ?? '');
  const [objetivo, setObjetivo] = useState(paso.objetivo ?? '');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Toque/día/canal/aprobación solo se editan desde "Arma tu cadencia" (arriba); aquí
  // solo se toca el copy -- Sebastián pidió separar las dos cosas (2026-07-08) para que
  // no haya dos lugares distintos donde cambiar el canal o el día de un mismo toque.
  function guardar() {
    setError('');
    startTransition(async () => {
      if (canalActual === 'llamada') {
        const resMeta = await actualizarPasoCadenciaAction(paso.idPaso, { objetivo: objetivo.trim() || null }, idCadencia);
        if (!resMeta.ok) {
          setError(resMeta.error);
          return;
        }
      }
      // asunto e objetivo son mutuamente exclusivos por canal: si el paso no es
      // correo, no vale la pena seguir guardando un asunto viejo.
      const resCopy = await editarCopyPasoAction(paso.idPaso, canalActual === 'correo' ? asunto : '', cuerpo, idCadencia);
      if (!resCopy.ok) {
        setError(resCopy.error);
        return;
      }
      onActualizado({
        objetivo: canalActual === 'llamada' ? objetivo.trim() || null : paso.objetivo,
        asunto: canalActual === 'correo' ? asunto || null : null,
        cuerpo: cuerpo || null,
      });
      onCerrar();
    });
  }

  // Los inputs locales solo se inicializan una vez (useState no vuelve a leer el
  // valor inicial en re-renders). Si el paso cambio desde afuera -- el grid "Arma tu
  // cadencia" de arriba, o un guardado anterior -- hay que refrescarlos al abrir el
  // editor, si no el formulario arranca con datos viejos.
  function handleEditar() {
    setAsunto(paso.asunto ?? '');
    setCuerpo(paso.cuerpo ?? '');
    setObjetivo(paso.objetivo ?? '');
    onEditar();
  }

  return (
    <div className="flex gap-4">
      <div className="flex w-[52px] shrink-0 flex-col items-center">
        <div className="mb-2 whitespace-nowrap font-mono-tag text-[11px] text-muted">Día {paso.diaOffset}</div>
        <span className={cn('block h-3 w-3 rounded-full', canalActual ? CANAL_DOT[canalActual] : 'bg-faint')} />
        {!esUltimo && <span className="my-1.5 min-h-[34px] w-0.5 flex-1 bg-line/60" />}
      </div>

      <div className="mb-4 flex-1 rounded-[13px] border border-line bg-surface px-[18px] py-4 transition-colors hover:border-line-strong">
        <div className="mb-2.5 flex items-center gap-2.5">
          {canalActual ? <CanalTag canal={canalActual} /> : <span className="text-[11px] font-medium text-muted">{paso.canal}</span>}
          <span className="font-mono-tag text-xs text-faint">Paso {paso.orden}</span>
          {!editando && (
            <button type="button" onClick={handleEditar} className="ml-auto text-xs font-medium text-accent-soft hover:text-accent">
              Editar copy
            </button>
          )}
        </div>

        {editando ? (
          <div className="flex flex-col gap-2.5">
            {canalActual === 'correo' && (
              <input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Asunto"
                className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            )}
            {canalActual === 'llamada' && (
              <input
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                placeholder="Objetivo de la llamada (ej. agendar 15 min de revisión)"
                className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            )}
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={4}
              placeholder={canalActual ? CUERPO_LABEL[canalActual] : 'Copy'}
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
            {error && <p className="mb-1.5 text-xs text-overdue">{error}</p>}
            {canalActual === 'correo' && paso.asunto && (
              <p className="mb-1.5 text-sm font-medium text-ink">Asunto: {conVariablesResaltadas(paso.asunto)}</p>
            )}
            {canalActual === 'llamada' && paso.objetivo && (
              <p className="mb-1.5 text-sm font-medium text-ink">Objetivo: {paso.objetivo}</p>
            )}
            {paso.cuerpo ? (
              <p className="text-[13px] leading-relaxed text-ink-soft">{conVariablesResaltadas(paso.cuerpo)}</p>
            ) : (
              <p className="text-[13px] font-medium text-pending">
                {canalActual === 'llamada'
                  ? '(sin guion -- opcional)'
                  : `Sin copy de ${canalActual ? CANAL_LABEL[canalActual] : paso.canal} -- falta antes de poder continuar`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
