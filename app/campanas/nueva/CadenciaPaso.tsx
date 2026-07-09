'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { crearBorradorDesdeCadenciaAction, actualizarBorradorAction, abandonarBorradorAction } from './actions';
import { ImportarCadencia, type CadenciaResuelta } from './ImportarCadencia';
import { CadenciaCockpit, type PasoCadenciaUI } from '../../cadencias/[id]/CadenciaCockpit';
import { PasosWizard, type PasoWizardItem } from './PasosWizard';
import type { ModoCampana } from '../../db/validation';
import type { Segmento } from './NuevaCampanaFlujo';

export function CadenciaPaso({ segmento, onVolver }: { segmento: Segmento; onVolver: () => void }) {
  const router = useRouter();
  const [cadencia, setCadencia] = useState<CadenciaResuelta | null>(null);
  const [idCampana, setIdCampana] = useState<number | null>(null);
  const [idCadencia, setIdCadencia] = useState<number | null>(null);
  const [pasosCadencia, setPasosCadencia] = useState<PasoCadenciaUI[]>([]);
  const [nombreCampana, setNombreCampana] = useState('');
  const [modo, setModo] = useState<ModoCampana>('prioritaria');
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navegando, setNavegando] = useState(false);
  const nombreGuardadoRef = useRef('');

  // Draft persistente: en cuanto la cadencia resuelve (formato + contenido validos),
  // se crea la campana en 'borrador' de una vez, sin esperar ningun clic mas. Si el
  // usuario cierra la pestaña aca, el draft ya quedo con id propio en /campanas.
  async function onCadenciaResuelta(r: CadenciaResuelta) {
    setCadencia(r);
    setError(null);
    setGuardandoBorrador(true);
    const nombreInicial = r.preview.nombre;
    const res = await crearBorradorDesdeCadenciaAction({
      idSegmento: segmento.id,
      formato: r.formato,
      contenido: r.contenido,
      nombreCsv: r.nombreCsv,
    });
    setGuardandoBorrador(false);
    if (res.ok) {
      setIdCampana(res.idCampana);
      setIdCadencia(res.idCadencia);
      setPasosCadencia(res.pasos);
      setNombreCampana(nombreInicial);
      nombreGuardadoRef.current = nombreInicial;
    } else {
      setError(res.error);
    }
  }

  // "Cambiar cadencia" no reusa el borrador: crearBorradorDesdeCadenciaAction siempre
  // arma uno nuevo. Sin este cleanup, el anterior quedaba vivo para siempre como
  // borrador huerfano (nadie mas lo referencia, pero tampoco se borra solo).
  function onLimpiarCadencia() {
    if (idCampana) void abandonarBorradorAction(idCampana);
    setCadencia(null);
    setIdCampana(null);
    setIdCadencia(null);
    setPasosCadencia([]);
    setNombreCampana('');
  }

  async function guardarNombreSiCambio() {
    if (!idCampana) return;
    const nombre = nombreCampana.trim();
    if (!nombre || nombre === nombreGuardadoRef.current) return;
    nombreGuardadoRef.current = nombre;
    const res = await actualizarBorradorAction(idCampana, { nombre });
    if (!res.ok) setError(res.error);
  }

  async function cambiarModo(nuevo: ModoCampana) {
    setModo(nuevo);
    if (!idCampana) return;
    const res = await actualizarBorradorAction(idCampana, { modo: nuevo });
    if (!res.ok) setError(res.error);
  }

  // Antes iba directo a /lanzar: quien recibe la campana quedaba oculto hasta despues
  // de crearla. Ahora el siguiente paso del flujo es Destinatarios (la factura de a
  // quien se inscribe), y de ahi Lanzar es la accion final -- ver DestinatariosCockpit.
  function continuarADestinatarios() {
    if (!idCampana) return;
    setNavegando(true);
    router.push(`/campanas/${idCampana}/destinatarios`);
  }

  // Destinatarios/Preview/Lanzar ya tienen ruta real en cuanto existe idCampana (nace
  // apenas la cadencia resuelve) -- dejarlos como link deja "espiar" el resto del
  // flujo sin tener que terminar Cadencia primero.
  const pasos: PasoWizardItem[] = [
    { label: 'Segmento', onClick: onVolver },
    { label: 'Cadencia' },
    { label: 'Destinatarios', href: idCampana ? `/campanas/${idCampana}/destinatarios` : undefined },
    { label: 'Preview', href: idCampana ? `/campanas/${idCampana}/preview` : undefined },
    { label: 'Lanzar', href: idCampana ? `/campanas/${idCampana}/lanzar` : undefined },
  ];

  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-bg shadow-[0_30px_70px_-28px_rgba(0,0,0,.6)]">
      <div className="flex items-center justify-between border-b border-line">
        <PasosWizard pasos={pasos} activo="Cadencia" />
        <div className="flex shrink-0 items-center gap-3 pr-6 text-[13px]">
          {idCampana && (
            <span className="text-[12px] text-faint">
              {guardandoBorrador ? 'Guardando borrador…' : `Guardado como borrador #${idCampana}`}
            </span>
          )}
          <span className="text-[13px] text-muted">
            Segmento: <span className="font-medium text-ink-soft">{segmento.nombre}</span>
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] px-8 py-8">
        <ImportarCadencia onResuelto={onCadenciaResuelta} onLimpiar={onLimpiarCadencia} ocultarPasosResueltos />
      </div>

      {cadencia && (
        <div className="flex flex-col gap-6 border-t border-line px-8 py-8">
          <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
            <input
              value={nombreCampana}
              onChange={(e) => setNombreCampana(e.target.value)}
              onBlur={guardarNombreSiCambio}
              placeholder="Nombre de la campaña"
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-[10px] text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink-soft"
            />
          </div>

          {/* Mismo editor que ve una campana ya creada al entrar a su tab Cadencia --
              una sola vista en todos lados, sin variantes. key={idCadencia} lo
              remonta limpio si "Cambiar cadencia" trae otro id. */}
          {idCadencia && (
            <div className="mx-auto w-full max-w-[900px]">
              <CadenciaCockpit
                key={idCadencia}
                idCadencia={idCadencia}
                nombre={nombreCampana}
                pasos={pasosCadencia}
                modo={modo}
                onCambiarModo={cambiarModo}
              />
            </div>
          )}

          <div className="mx-auto flex w-full max-w-[900px] flex-col gap-3">
            {error && <p className="text-[13px] text-overdue">{error}</p>}
            <button
              type="button"
              onClick={continuarADestinatarios}
              disabled={!idCampana || !nombreCampana.trim() || navegando}
              className="self-start rounded-[9px] bg-accent px-5 py-[10px] text-[13px] font-semibold text-bg disabled:opacity-40"
            >
              {navegando ? 'Abriendo…' : 'Continuar a Destinatarios'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
