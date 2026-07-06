import Link from "next/link";
import { colaDelDia, contadoresHoy, agendaHoyCadencias } from "../db/repository";
import { repartirAction, registrarTapAction, aprobarPasoManualAction } from "../actions";
import { RESULTADO_LABELS, CANALES, RESULTADOS } from "../db/validation";
import { requireSession } from "../lib/session";
import TopNav from "../TopNav";

const OWNERS = [
  { key: "Sebastian Acosta Molina", label: "Sebastián" },
  { key: "Felipe Castro", label: "Felipe" },
  { key: "Thomas Schumacher", label: "Thomas" },
];

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
  const cadenciasHoy = agendaHoyCadencias(hoy);

  return (
    <div className="wrap">
      <TopNav email={usuario.email} />
      <Link href="/" className="back">← Inicio</Link>
      <div className="head">
        <div>
          <div className="h-title">Toques del día</div>
          <div className="switch">
            {OWNERS.map((o) => (
              <Link key={o.key} href={`/cola?owner=${encodeURIComponent(o.key)}`} className={o.key === owner ? "on" : ""}>
                {o.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="h-meta">
          <span className="mono">{cola.length}</span> hoy · <span className="mono">{vencidos}</span> vencidos
        </div>
      </div>

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

      {cadenciasHoy.length > 0 && (
        <div className="cadencias-hoy">
          <div className="h-title" style={{ fontSize: 15, marginBottom: 10 }}>Cadencias de hoy</div>
          {cadenciasHoy.map((t) => {
            const atrasado = (t.fechaProgramada ?? "").slice(0, 10) < hoy;
            return (
              <div className="row-wrap" key={t.idPasoInscripcion}>
                <div className="row">
                  <div>
                    <div className="l1">
                      <span className={`dot ${atrasado ? "overdue" : "today"}`} aria-hidden="true" />
                      <span className="emp">{t.empresaNombre}</span>
                      <span className={`pill ${t.esManual ? "warm" : "cold"}`}>
                        {t.esManual ? "manual · Tier 1" : "automatico"}
                      </span>
                      {t.nombre && <span className="contact">{t.nombre}</span>}
                    </div>
                    <div className="l2">
                      <span>canal <b>{t.canal}</b></span>
                      <span>contacto <b>{t.email ?? "—"}</b></span>
                      {t.asunto && <span>asunto <b>{t.asunto}</b></span>}
                    </div>
                  </div>
                  <div className="right">
                    <div className={`when ${atrasado ? "overdue" : "today"}`}>
                      {atrasado ? "atrasado" : "hoy"}
                    </div>
                  </div>
                </div>
                {t.esManual === 1 && (
                  <form className="tap-row" action={aprobarPasoManualAction}>
                    <input type="hidden" name="idPasoInscripcion" value={t.idPasoInscripcion} />
                    <button type="submit" className="tap-btn">Aprobar (ya lo hice)</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

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
