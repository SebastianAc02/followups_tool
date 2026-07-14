"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { Dot } from "../ui/Dot";
import type { LineaWhatsapp as LineaWhatsappRow } from "../db/repository";
import {
  agregarLineaAction,
  verificarEstadoLineaAction,
  desconectarLineaAction,
  probarLineaAction,
  verificarMensajeRecibidoAction,
  type ResultadoConexion,
  type ResultadoPrueba,
  type ResultadoRecepcion,
} from "./lineas-whatsapp-actions";

// Tarea 8 (D6, plan-whatsapp-adapter.md): "Tus lineas de WhatsApp" vive DEBAJO del
// CredencialForm del conector (esa sigue siendo la llave admin del SERVIDOR Evolution
// completo, cosa aparte). Esta seccion la ve CUALQUIER usuario -- no solo admin -- porque
// cada quien conecta y aparea SU propio numero (linea_whatsapp.id_usuario = sesion.id).
// Sesion 2026-07-11 (pedido de Sebastian): soporta VARIAS lineas por usuario, y "probar"
// pasa de un input inline a un dialogo de dos pasos (enviar + recibir) que se cierra
// solo al confirmar las dos direcciones.

const SEV_LINEA = { activa: "done", calentando: "today", caida: "overdue" } as const;
const LABEL_LINEA = { activa: "Conectada", calentando: "Vinculando", caida: "Caída" } as const;

function PasoEnviar({ id, onEnviado }: { id: number; onEnviado: () => void }) {
  const [resultado, accion, pendiente] = useActionState<ResultadoPrueba | null, FormData>(probarLineaAction, null);

  useEffect(() => {
    if (resultado?.ok) onEnviado();
  }, [resultado, onEnviado]);

  return (
    <div>
      <p className="mb-3 text-sm leading-relaxed text-muted">
        Mandamos un mensaje de prueba a cualquier número (el tuyo, el de alguien más — no importa, solo confirma
        que la línea manda).
      </p>
      <form action={accion} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          name="destino"
          type="tel"
          placeholder="Número de destino, con código de país"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 font-mono-tag text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Enviando..." : "Enviar prueba"}
        </Button>
      </form>
      {resultado && !resultado.ok && <p className="mt-2 text-xs text-overdue">{resultado.error}</p>}
    </div>
  );
}

function PasoRecibir({ id, desde, onConfirmado }: { id: number; desde: string; onConfirmado: () => void }) {
  const [resultado, accion, pendiente] = useActionState<ResultadoRecepcion | null, FormData>(
    verificarMensajeRecibidoAction,
    null,
  );
  const yaLlego = resultado?.ok && resultado.recibido;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-done">
        <span aria-hidden="true">✓</span> Prueba de envío mandada
      </p>

      {!yaLlego ? (
        <>
          <p className="mb-3 mt-2 text-sm leading-relaxed text-muted">
            Ahora pídele a alguien que te escriba un WhatsApp a esta línea.
          </p>
          <form action={accion}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="desde" value={desde} />
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Buscando..." : "Ya me escribió, verificar"}
            </Button>
          </form>
          {resultado?.ok === false && <p className="mt-2 text-xs text-overdue">{resultado.error}</p>}
          {resultado?.ok && !resultado.recibido && (
            <p className="mt-2 text-xs text-muted">Todavía no llega nada. Intenta de nuevo en un momento.</p>
          )}
        </>
      ) : (
        <div className="mt-2 rounded-md border-l-2 border-done bg-done-bg px-3 py-2.5 text-sm leading-relaxed text-ink">
          <p className="mb-2">
            <strong>{resultado.nombreContacto ?? resultado.telefono}</strong>
            {resultado.nombreContacto ? ` (${resultado.telefono})` : ""} te escribió: &quot;{resultado.texto}&quot;
          </p>
          <p className="mb-3 text-xs text-muted">¿Es correcto?</p>
          <Button type="button" onClick={onConfirmado}>
            Sí, confirmar
          </Button>
        </div>
      )}
    </div>
  );
}

function ProbarConexionDialog({ linea, onCerrar }: { linea: LineaWhatsappRow; onCerrar: () => void }) {
  const [paso, setPaso] = useState<"enviar" | "recibir">("enviar");
  // Momento en que se abrio el dialogo: filtro del paso "recibir" para no confundir un
  // mensaje viejo con la prueba en curso. Un solo new Date() al montar, no en cada render.
  const desdeRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCerrar]);

  return (
    <div
      role="presentation"
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[18px] border border-line-strong bg-card p-7 shadow-[0_30px_70px_-28px_rgba(0,0,0,.6)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl text-ink">Probar {linea.numero}</h2>
            <p className="mt-1 text-sm text-muted">Confirmá que la línea manda y recibe antes de darla por lista.</p>
          </div>
          <button type="button" onClick={onCerrar} className="text-sm text-faint hover:text-ink">
            Cerrar
          </button>
        </div>

        <PasoEnviar id={linea.id} onEnviado={() => setPaso("recibir")} />
        {paso === "recibir" && <PasoRecibir id={linea.id} desde={desdeRef.current} onConfirmado={onCerrar} />}
      </div>
    </div>
  );
}

function LineaRow({ linea }: { linea: LineaWhatsappRow }) {
  const [probando, setProbando] = useState(false);
  const sev = SEV_LINEA[linea.estado as keyof typeof SEV_LINEA] ?? "faint";
  const label = LABEL_LINEA[linea.estado as keyof typeof LABEL_LINEA] ?? linea.estado;

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Dot sev={sev} />
          <span className="font-mono-tag text-sm text-ink">{linea.numero}</span>
          <Pill tone="cold">{linea.tipo === "personal" ? "Personal" : "Pool"}</Pill>
        </div>
        <span className="text-xs text-muted">{label}</span>
      </div>

      {/* Sin form inline de prueba aca: el estado de la fila se queda en "Conectada" +
          este boton, en vez de tener siempre abierto el input de probar (D6 revisado,
          pedido de Sebastian: no saturar la fila). */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {linea.estado === "activa" && (
          <Button type="button" variant="quiet" onClick={() => setProbando(true)}>
            Probar conexión
          </Button>
        )}
        <form action={verificarEstadoLineaAction}>
          <input type="hidden" name="id" value={linea.id} />
          <Button type="submit" variant="quiet">
            Verificar estado
          </Button>
        </form>
        <form action={desconectarLineaAction}>
          <input type="hidden" name="id" value={linea.id} />
          <Button type="submit" variant="quiet" className="text-overdue/80 hover:text-overdue">
            Desconectar
          </Button>
        </form>
      </div>

      {probando && <ProbarConexionDialog linea={linea} onCerrar={() => setProbando(false)} />}
    </div>
  );
}

function AgregarLinea({ onCancelar }: { onCancelar?: () => void }) {
  const [resultado, accion, pendiente] = useActionState<ResultadoConexion | null, FormData>(agregarLineaAction, null);
  return (
    <div className="rounded-lg border border-dashed border-line p-4">
      {/* Input en su propia fila SIEMPRE (nunca comparte fila con los botones): un
          flex-wrap con los tres elementos apretados en 384px cortaba el placeholder a
          la mitad ("Número a cone..."). Apilado es lo que de verdad no se aprieta,
          angosto o ancho el contenedor. */}
      <form action={accion} className="flex flex-col gap-3">
        <input
          name="numero"
          type="tel"
          placeholder="Número a conectar, con código de país (ej. 57...)"
          className="w-full rounded-lg border border-line bg-bg px-3.5 py-3 font-mono-tag text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pendiente}>
            {pendiente ? "Pidiendo código..." : "Conectar número"}
          </Button>
          {onCancelar && (
            <Button type="button" variant="quiet" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {resultado && !resultado.ok && <p className="mt-3 text-xs text-overdue">{resultado.error}</p>}

      {resultado && resultado.ok && (
        <div className="mt-4 rounded-md border-l-2 border-today bg-today-bg px-4 py-3 text-sm leading-relaxed text-ink">
          <p className="mb-1.5">
            En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular un dispositivo → &quot;Vincular con
            número de teléfono&quot;.
          </p>
          <p>
            Escribe este código:{" "}
            <span className="font-mono-tag text-base font-semibold tracking-widest">{resultado.pairingCode}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function LineasWhatsapp({
  misLineas,
  lineasPool,
  esAdmin,
}: {
  misLineas: LineaWhatsappRow[];
  lineasPool: LineaWhatsappRow[];
  esAdmin: boolean;
}) {
  // Abierto por defecto solo si todavia no hay ninguna linea propia (primera vez).
  // Con lineas ya conectadas, "Agregar otro numero" queda colapsado para no repetir el
  // formulario vacio debajo de filas ya conectadas.
  const [agregando, setAgregando] = useState(misLineas.length === 0);

  return (
    // max-w-lg (no max-w-sm): esta seccion carga varias filas + un form + guia de
    // apareo, no una sola credencial -- 384px la dejaba viendose amontonada. El
    // contenedor real (columna de ConectorRow) tiene de sobra para esto.
    <div className="mt-5 max-w-lg">
      <p className="mb-3 text-xs uppercase tracking-widest text-muted">Tus líneas de WhatsApp</p>
      {misLineas.length > 0 && (
        <div className="mb-3 flex flex-col gap-3">
          {misLineas.map((l) => (
            <LineaRow key={l.id} linea={l} />
          ))}
        </div>
      )}

      {agregando ? (
        <AgregarLinea onCancelar={misLineas.length > 0 ? () => setAgregando(false) : undefined} />
      ) : (
        <Button type="button" onClick={() => setAgregando(true)}>
          + Agregar otro número
        </Button>
      )}

      {esAdmin && lineasPool.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-widest text-muted">Líneas de pool</p>
          <div className="flex flex-col gap-2">
            {lineasPool.map((l) => (
              <LineaRow key={l.id} linea={l} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
