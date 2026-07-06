import Link from "next/link";
import { colaDelDia, contadoresHoy, listarCadencias, listarCampanas, estadoConector, getCadencia } from "./db/repository";
import { CANALES } from "./db/validation";
import { requireSession } from "./lib/session";
import TopNav from "./TopNav";

const CANAL_LABEL: Record<string, string> = { llamada: "llamadas", whatsapp: "whatsapp", correo: "correos" };

// Estados "calientes" del pipeline. Mismas claves que ESTADO_PILL en /cola; se cuentan
// en memoria sobre la cola del dia, sin query nueva.
const PIPELINE_CALIENTE: { estado: string; label: string }[] = [
  { estado: "reunion_agendada", label: "reuniones" },
  { estado: "oportunidad", label: "oportunidades" },
  { estado: "cierre_documentacion", label: "cierres" },
  { estado: "enviar_contrato", label: "contratos" },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function fechaLarga(d: Date) {
  const dia = DIAS[d.getDay()];
  const texto = `${dia} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function Dashboard() {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);
  const ayerDate = new Date(ahora);
  ayerDate.setDate(ayerDate.getDate() - 1);
  const ayer = ayerDate.toISOString().slice(0, 10);

  const cola = colaDelDia(hoy, owner);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const hechoHoy = contadoresHoy(hoy, owner);
  const hechoAyer = contadoresHoy(ayer, owner);

  const pipeline = PIPELINE_CALIENTE.map((p) => ({
    ...p,
    n: cola.filter((c) => c.estado === p.estado).length,
  })).filter((p) => p.n > 0);

  const cadencias = listarCadencias();
  const cadenciaTop = cadencias.find((c) => c.activa);
  const pasosTop = cadenciaTop ? getCadencia(cadenciaTop.id)?.pasos.slice(0, 5) ?? [] : [];

  const campanasActivas = listarCampanas().filter((c) => c.estado === "activa").length;

  const conectados = [estadoConector("granola", usuario.id), estadoConector("notion")].filter(
    (e) => e.tieneCredencial,
  ).length;

  return (
    <div className="wrap">
      <TopNav email={usuario.email} />

      <div className="dash-masthead">{fechaLarga(ahora)}</div>

      {cola.length > 0 ? (
        <p className="dash-brief">
          <span className="mono dash-brief-num">{cola.length}</span> follow-ups para hoy
          {vencidos > 0 && (
            <>
              , <span className="mono dash-brief-num overdue">{vencidos}</span> ya vencidos
            </>
          )}
          .{" "}
          {hechoAyer.total > 0 && (
            <>
              Ayer cerraste <span className="mono dash-brief-num done">{hechoAyer.total}</span>.
            </>
          )}
        </p>
      ) : (
        <p className="dash-brief">
          Sin follow-ups para hoy. Buen trabajo.
          {hechoAyer.total > 0 && (
            <>
              {" "}
              Ayer cerraste <span className="mono dash-brief-num done">{hechoAyer.total}</span>.
            </>
          )}
        </p>
      )}

      {cola.length > 0 && (
        <Link href="/cola" className="cta-primary">
          Entrar a los toques →
        </Link>
      )}

      <div className="dash-cols">
        <div className="dash-col-quiet">
          <div className="section-label">Hoy hiciste</div>
          {hechoHoy.total === 0 ? (
            <div className="dash-muted">Nada todavía.</div>
          ) : (
            CANALES.map((canal) => (
              <div key={canal} className="dash-line">
                <span className="mono">{hechoHoy.porCanal[canal]}</span> {CANAL_LABEL[canal]}
              </div>
            ))
          )}
        </div>
        <div className="dash-col-quiet">
          <div className="section-label">Pipeline en cola</div>
          {pipeline.length === 0 ? (
            <div className="dash-muted">Nada caliente en cola.</div>
          ) : (
            pipeline.map((p) => (
              <div key={p.estado} className="dash-line">
                <span className="mono">{p.n}</span> {p.label}
              </div>
            ))
          )}
        </div>
      </div>

      <Link href="/campanas" className="dash-campanas">
        <div className="dash-campanas-head">
          <span className="section-label">Campañas</span>
          <span className="dash-campanas-count mono">{campanasActivas} activas</span>
        </div>
        {pasosTop.length > 0 ? (
          <>
            <div className="dash-campanas-nombre">{cadenciaTop!.nombre}</div>
            <div className="nav-cad-timeline">
              {pasosTop.map((p, i) => (
                <span key={p.idPaso} style={{ display: "contents" }}>
                  {i > 0 && <span className="nav-cad-line" />}
                  <span className="nav-cad-dot" data-canal={p.canal ?? undefined} />
                </span>
              ))}
            </div>
            <span className="nav-cad-days mono">{pasosTop.map((p) => `D${p.diaOffset}`).join(" · ")}</span>
          </>
        ) : (
          <div className="dash-muted">Sin campañas todavía.</div>
        )}
      </Link>

      <div className="dash-utility">
        <Link href="/toque-independiente">Agregar un toque manual</Link>
        <Link href="/conectores">
          Conectores <span className="mono">({conectados} {conectados === 1 ? "conectado" : "conectados"})</span>
        </Link>
      </div>
    </div>
  );
}
