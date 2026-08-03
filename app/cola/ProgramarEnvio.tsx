'use client';

import { useState } from 'react';
import { aprobarYProgramarAction } from '../actions';
import { renderizarCopy } from '../core/render-copy';
import { cn } from '../ui/cn';
import { button } from '../ui/button.variants.ts';

// "Apruébalo y que salga": el gesto que la web no tenía.
//
// El otro botón de esta misma pantalla dice "ya lo mandé yo" (aprobarPasoManual: marca el paso
// enviada y escribe el toque, sin mandar nada). Este deja el copy revisado + aprobado_en y el
// paso PENDIENTE, para que lo empuje el worker a su hora. Se ven distintos y dicen cosas
// distintas a propósito: confundirlos deja un toque escrito por un mensaje que nunca salió, o
// un mensaje saliendo dos veces.
//
// Las variables se resuelven POR EMPRESA, no una sola vez: en un lote el texto es el mismo pero
// [nombre] no. Se renderiza al enviar, con los datos de cada destinatario, que es lo mismo que
// hace el cockpit de /llamada antes de mandar.

export type DestinoProgramable = {
  idPasoInscripcion: number;
  nombreContacto: string | null;
  nombreEmpresa: string;
};

const HORA_POR_DEFECTO = '11:00';

function datosDe(d: DestinoProgramable): Record<string, string> {
  const datos: Record<string, string> = { empresa: d.nombreEmpresa };
  if (d.nombreContacto) datos.nombre = d.nombreContacto;
  return datos;
}

export function ProgramarEnvio({
  destinos,
  plantilla,
  aprobadoEn,
  fechaProgramada,
}: {
  destinos: DestinoProgramable[];
  plantilla: string;
  // Ya aprobado: no se ofrece el gesto otra vez, se dice a qué hora quedó. Reprogramarlo se
  // hace donde se edita el copy, no acá con un botón que parece un duplicado del de al lado.
  aprobadoEn: string | null;
  fechaProgramada: string | null;
}) {
  const [texto, setTexto] = useState(plantilla);
  const [hora, setHora] = useState(HORA_POR_DEFECTO);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (aprobadoEn) {
    return (
      <p className="mt-2 text-[12.5px] text-done">
        Aprobado, lo manda la herramienta{fechaProgramada ? ` desde las ${horaCorta(fechaProgramada)}` : ''}.
      </p>
    );
  }

  async function programar() {
    setEnviando(true);
    setError(null);
    setMensaje(null);
    const r = await aprobarYProgramarAction({
      pasos: destinos.map((d) => ({ idPasoInscripcion: d.idPasoInscripcion, cuerpo: renderizarCopy(texto, datosDe(d)).texto })),
      hora,
    });
    if (r.ok) {
      const rechazados = r.rechazados.length > 0 ? `, ${r.rechazados.length} sin programar (ya salieron)` : '';
      setMensaje(`${r.programados} programado${r.programados === 1 ? '' : 's'} desde las ${hora}${rechazados}.`);
    } else {
      setError(r.error);
    }
    setEnviando(false);
  }

  return (
    <div className="mt-2 rounded-[10px] border border-line bg-hover px-3 py-2.5">
      <p className="text-[12.5px] text-muted">
        Aprobar para que lo mande la herramienta {destinos.length > 1 ? `(${destinos.length} empresas)` : ''}
      </p>
      <textarea
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Texto que va a salir..."
        className="mt-1.5 w-full rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-[12.5px] text-muted">
          Sale desde las{' '}
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="rounded-[8px] border border-line bg-card px-2 py-1 text-[12.5px] text-ink outline-none focus:border-line-strong"
          />
        </label>
        <button
          type="button"
          onClick={programar}
          disabled={enviando || texto.trim() === ''}
          className={cn(button({ variant: 'pill' }), 'text-[12.5px]')}
        >
          {enviando ? 'Programando...' : 'Aprobar y que salga'}
        </button>
      </div>
      {/* La hora es un PISO de elegibilidad, no el segundero: el worker corre cada 5 minutos y
          separa los de una misma pasada con su propio espaciado. Decirlo acá evita que alguien
          mire el reloj a las 11:00:00 y crea que se rompió. */}
      <p className="mt-1.5 text-[11.5px] text-faint">
        Hora de Bogotá y es desde cuándo queda habilitado: el envío real lo hace el worker en su
        siguiente pasada.
      </p>
      {mensaje && <p className="mt-1.5 text-[12.5px] text-done">{mensaje}</p>}
      {error && <p className="mt-1.5 text-[12.5px] text-overdue">{error}</p>}
    </div>
  );
}

function horaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
}
