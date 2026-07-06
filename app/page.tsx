import Link from "next/link";
import { colaDelDia, contadoresHoy, listarCadencias, estadoConector } from "./db/repository";
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
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
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

  const cadenciasActivas = listarCadencias().filter((c) => c.activa).length;
  const conectados = [estadoConector("granola", usuario.id), estadoConector("notion")].filter(
    (e) => e.tieneCredencial,
  ).length;

  return (
    <div className="wrap">
      <TopNav email={usuario.email} />

      <div className="dash-date">{fechaLarga(ahora)}</div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-num mono">{cola.length}</div>
          <div className="kpi-label">hoy</div>
        </div>
        <div className="kpi">
          <div className="kpi-num mono">{vencidos}</div>
          <div className="kpi-label">vencidos</div>
        </div>
        <div className="kpi">
          <div className="kpi-num mono">{hechoAyer.total}</div>
          <div className="kpi-label">ayer</div>
        </div>
      </div>

      {cola.length > 0 ? (
        <Link href="/cola" className="cta-primary">
          Entrar a los toques ({cola.length} hoy) →
        </Link>
      ) : (
        <div className="cta-empty">Sin follow-ups para hoy. Buen trabajo.</div>
      )}

      <div className="dash-cols">
        <div className="dash-col">
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
        <div className="dash-col">
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

      <div className="nav-cards">
        <Link href="/toque-independiente" className="nav-card">
          <span className="nav-card-title">Agregar toque</span>
          <span className="nav-card-meta">manual</span>
        </Link>
        <Link href="/cadencias" className="nav-card">
          <span className="nav-card-title">Cadencias</span>
          <span className="nav-card-meta mono">{cadenciasActivas} activas</span>
        </Link>
        <Link href="/conectores" className="nav-card">
          <span className="nav-card-title">Conectores</span>
          <span className="nav-card-meta mono">{conectados} conectados</span>
        </Link>
      </div>
    </div>
  );
}
