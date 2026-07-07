import Link from "next/link";
import { colaDelDia, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
import { repartirAction, registrarTapAction } from "../actions";
import { RESULTADO_LABELS, CANALES, RESULTADOS } from "../db/validation";
import { requireSession } from "../lib/session";
import TopNav from "../TopNav";
import CadenciasHoy from "./CadenciasHoy";
import { DashboardHeader } from "./DashboardHeader";
import { contarCerradas } from "./stats";

const ACCION: Record<string, string> = { llamada: "Llamar", whatsapp: "WhatsApp", correo: "Correo" };
const CANAL_LABEL: Record<string, string> = { llamada: "llamadas", whatsapp: "whatsapp", correo: "correos" };
const CANALES_ORDEN = CANALES;
const RESULTADOS_ORDEN = RESULTADOS;

const ESTADO_PILL: Record<string, { l: string; c: string }> = {
  reunion_agendada: { l: "reunión", c: "hot" },
  oportunidad: { l: "oportunidad", c: "hot" },
  cierre_documentacion: { l: "cierre", c: "hot" },
  enviar_contrato: { l: "contrato", c: "hot" },
  contacto_iniciado: { l: "contactado", c: "warm" },
  lead: { l: "lead", c: "warm" },
  on_hold: { l: "on hold", c: "cold" },
};

function diasVencido(fechaISO: string, hoyISO: string) {
  return Math.round((Date.parse(hoyISO) - Date.parse(fechaISO)) / 86400000);
}

export default async function Cola({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  // Pipeline compartido (B3 v1): cualquier autenticado puede MIRAR la cola de otro por
  // ?owner=, pero el default es el owner de la sesion, ya no OWNERS[0].
  const owner = sp.owner ?? usuario.owner;
  const esPropia = owner === usuario.owner;
  const hoy = new Date().toISOString().slice(0, 10);
  const cola = colaDelDia(hoy, owner);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const contadores = contadoresHoy(hoy, owner);
  // V5.7: cadencias (automatico Apollo + manual Tier 1) no son por owner todavia
  // (campana.owner es la campana masiva, no un individuo -- ver memoria del proyecto);
  // se muestran a cualquier sesion, la cola unificada es informativa para todos.
  // Parte 4 campanas: el historial (dias ya tocados) solo tiene sentido para los
  // manuales -- son los unicos con boton de "Aprobar" que necesita saber en que
  // paso va el lead. Se evita la consulta extra para los automaticos.
  const cadenciasHoy = agendaHoyCadencias(hoy).map((t) => ({
    ...t,
    historial: t.esManual === 1 ? historialPasosDestinatario(t.idDestinatario) : [],
  }));

  return (
    <div className="mx-auto max-w-[860px] px-6 pt-10 pb-[110px]">
      <TopNav email={usuario.email} />
      <Link href="/" className="mb-5 inline-block text-[13px] text-muted transition-colors hover:text-ink">
        ← Inicio
      </Link>
      <DashboardHeader
        nombre={usuario.owner.split(" ")[0]}
        hoy={hoy}
        owner={owner}
        pendientes={cola.length}
        vencidas={vencidos}
        cerradas={contarCerradas(contadores)}
      />

      {contadores.total > 0 && (
        <div className="counters">
          <div className="counters-row">
            {CANALES_ORDEN.map((canal) => (
              <span key={canal}>
                <span className="mono">{contadores.porCanal[canal]}</span> {CANAL_LABEL[canal]}
              </span>
            ))}
          </div>
          <div className="counters-row">
            {RESULTADOS_ORDEN.map((resultado) => (
              <span key={resultado}>
                <span className="mono">{contadores.porResultado[resultado]}</span> {RESULTADO_LABELS[resultado].toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {esPropia && (
        <form action={repartirAction} className="repartir">
          <span className="rep-label">¿Atrasado? Reparte tus follow-ups</span>
          <input name="porDia" type="number" min={1} defaultValue={10} className="pordia mono" aria-label="follow-ups por día" />
          <span className="rep-unit">por día</span>
          <button className="rep-btn">Repartir</button>
        </form>
      )}

      {cadenciasHoy.length > 0 && <CadenciasHoy items={cadenciasHoy} hoy={hoy} />}

      {cola.length === 0 ? (
        <div className="empty">Sin follow-ups para hoy. Buen trabajo.</div>
      ) : (
        cola.map((c) => {
          const dias = diasVencido(c.fecha!, hoy);
          const sev = dias > 0 ? "overdue" : "today";
          const accion = ACCION[c.canal ?? "llamada"] ?? "Llamar";
          return (
            <div className="row-wrap" key={c.id}>
              <Link className="row" href={`/llamada/${c.id}`}>
                <div>
                  <div className="l1">
                    <span className={`dot ${sev}`} aria-hidden="true" />
                    <span className="emp">{c.empresa}</span>
                    {c.estado && ESTADO_PILL[c.estado] && (
                      <span className={`pill ${ESTADO_PILL[c.estado].c}`}>{ESTADO_PILL[c.estado].l}</span>
                    )}
                    {c.contacto && (
                      <span className="contact">
                        {c.contacto}
                        {c.cargo ? ` · ${c.cargo}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="l2">
                    <span>usuarios <b className="mono">{c.usuarios != null ? Math.round(c.usuarios) : "—"}</b></span>
                    <span>CRM <b>{c.crm ?? "—"}</b></span>
                    <span>pasarela <b>{c.pasarela ?? "—"}</b></span>
                  </div>
                  {c.proximoPaso && <div className="paso">{c.proximoPaso}</div>}
                </div>
                <div className="right">
                  <div className={`when ${sev}`}>{dias > 0 ? `vencido ${dias}d` : "hoy"}</div>
                  <div className="call-cta">{accion} →</div>
                </div>
              </Link>
              <form className="tap-row" action={registrarTapAction}>
                <input type="hidden" name="idEmpresa" value={c.id} />
                <input name="objecion" placeholder="Objeción (opcional)" className="tap-objecion" />
                <button type="submit" name="canal" value="whatsapp" className="tap-btn">WhatsApp</button>
                <button type="submit" name="canal" value="correo" className="tap-btn">Correo</button>
              </form>
            </div>
          );
        })
      )}
    </div>
  );
}
