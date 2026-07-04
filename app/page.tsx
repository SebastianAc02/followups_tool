import Link from "next/link";
import { colaDelDia } from "./db/repository";
import { repartirAction } from "./actions";

const OWNERS = [
  { key: "Sebastian Acosta Molina", label: "Sebastián" },
  { key: "Felipe Castro", label: "Felipe" },
  { key: "Thomas Schumacher", label: "Thomas" },
];

const ACCION: Record<string, string> = { llamada: "Llamar", whatsapp: "WhatsApp", correo: "Correo" };

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

export default async function Home({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const sp = await searchParams;
  const owner = sp.owner ?? OWNERS[0].key;
  const hoy = new Date().toISOString().slice(0, 10);
  const cola = colaDelDia(hoy, owner);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <div className="h-title">Toques del día</div>
          <div className="switch">
            {OWNERS.map((o) => (
              <Link key={o.key} href={`/?owner=${encodeURIComponent(o.key)}`} className={o.key === owner ? "on" : ""}>
                {o.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="h-meta">
          <span className="mono">{cola.length}</span> hoy · <span className="mono">{vencidos}</span> vencidos
        </div>
      </div>

      <form action={repartirAction} className="repartir">
        <input type="hidden" name="owner" value={owner} />
        <span className="rep-label">¿Atrasado? Reparte tus follow-ups</span>
        <input name="porDia" type="number" min={1} defaultValue={10} className="pordia mono" aria-label="follow-ups por día" />
        <span className="rep-unit">por día</span>
        <button className="rep-btn">Repartir</button>
      </form>

      {cola.length === 0 ? (
        <div className="empty">Sin follow-ups para hoy. Buen trabajo.</div>
      ) : (
        cola.map((c) => {
          const dias = diasVencido(c.fecha!, hoy);
          const sev = dias > 0 ? "overdue" : "today";
          const accion = ACCION[c.canal ?? "llamada"] ?? "Llamar";
          return (
            <Link className="row" key={c.id} href={`/llamada/${c.id}`}>
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
          );
        })
      )}
    </div>
  );
}
