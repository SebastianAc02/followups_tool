"use client";

import { useActionState } from "react";
import { Button } from "../ui/Button";
import type { EstadoConector } from "../db/repository";
import { confirmarVerificacionGmailAction, reenviarPruebaGmailAction, type ResultadoReenvioGmail } from "./gmail-actions";

// Etapa 1 (2026-07-14-secuencias-correo-gmail-design.md): reemplaza CredencialForm para
// Gmail -- no se pega una API key, se conecta por OAuth y se confirma con un correo de
// prueba real. Dos estados posibles (el tercero, "sin credencial", lo resuelve ConectorRow
// mostrando este componente vs el boton "Conectar"): pendiente de confirmar (credencial
// guardada, ultimoResultado todavia no es 'ok') y verificado (ultimoResultado === 'ok'). El
// texto de error (si el ultimo intento fallo) ya lo muestra ConectorRow arriba (hayError),
// no se duplica aca.
export function GmailConector({ estado, emailConectado }: { estado: EstadoConector; emailConectado: string | null }) {
  const verificado = estado.ultimoResultado === 'ok';

  const [resultadoReenvio, accionReenviar, reenviando] = useActionState<ResultadoReenvioGmail | null, FormData>(
    reenviarPruebaGmailAction,
    null,
  );

  if (!estado.tieneCredencial) {
    return (
      <a
        href="/api/conectores/gmail/iniciar"
        className="inline-flex items-center rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-bg hover:opacity-90"
      >
        Conectar Gmail
      </a>
    );
  }

  if (verificado) {
    return (
      <p className="text-sm text-muted">
        Conectado como <strong className="text-ink">{emailConectado}</strong>.
      </p>
    );
  }

  return (
    <div className="max-w-sm rounded-lg border border-dashed border-line p-4">
      <p className="text-sm leading-relaxed text-muted">
        Mandamos un correo de prueba a <strong className="text-ink">{emailConectado}</strong>. Revisa tu bandeja.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <form action={confirmarVerificacionGmailAction}>
          <Button type="submit">Sí, llegó — confirmar</Button>
        </form>
        <form action={accionReenviar}>
          <Button type="submit" variant="quiet" disabled={reenviando}>
            {reenviando ? "Enviando..." : "Reenviar prueba"}
          </Button>
        </form>
      </div>
      {resultadoReenvio && !resultadoReenvio.ok && (
        <p className="mt-2 text-xs text-overdue">{resultadoReenvio.error}</p>
      )}
    </div>
  );
}
