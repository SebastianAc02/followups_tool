import { redirect } from "next/navigation";
import { requireSession } from "../lib/session";
import { AppShell } from "../ui/shell/AppShell";
import { ventanaPromedio, promedioDiario, DIAS_HABILES } from "../core/actividad";
import {
  contarToquesEnDia,
  contarToquesEnRango,
  leadsTocadosEnRango,
  toquesPorCanal,
  toquesPorResultado,
  campanasActivas,
  inscripcionesActivas,
  empresasPorCadencia,
} from "../db/repository";
import { CANALES, RESULTADOS, RESULTADO_LABELS } from "../db/validation";

const CANAL_LABEL: Record<string, string> = { llamada: "Llamadas", whatsapp: "WhatsApp", correo: "Correo" };

// Tono semántico de cada resultado, reutilizando las variables de color que ya
// existen en globals.css (mismo lenguaje visual que los dots de vencido/hoy en Home).
const RESULTADO_TONO: Record<string, string> = {
  contesto_reunion: "pos",
  contesto_sigue_seguimiento: "mid",
  contesto_no: "neg",
  no_contesto: "neg",
};

function fmtPromedio(n: number): string {
  return n.toFixed(1);
}

export default async function Panel() {
  const usuario = await requireSession();
  if (!usuario.admin) redirect("/"); // sin flag admin, la ruta no existe para el usuario

  const hoy = new Date().toISOString().slice(0, 10);
  const { desde, hasta } = ventanaPromedio(hoy);

  const toquesAyer = contarToquesEnDia(hoy);
  const totalVentana = contarToquesEnRango(desde, hasta);
  const promedio = promedioDiario(totalVentana);
  const leads = leadsTocadosEnRango(desde, hasta);
  const porCanal = toquesPorCanal(desde, hasta);
  const porResultado = toquesPorResultado(desde, hasta);
  const campanas = campanasActivas();
  const inscripciones = inscripcionesActivas();
  const cadencias = empresasPorCadencia();

  const maxCanal = Math.max(1, ...CANALES.map((c) => porCanal[c]));
  const maxResultado = Math.max(1, ...RESULTADOS.map((r) => porResultado[r]));
  const maxCadencia = Math.max(1, ...cadencias.map((c) => c.empresas));

  const vsPromedio = toquesAyer - promedio;
  const comparacion =
    totalVentana === 0
      ? "sin datos en la ventana"
      : vsPromedio >= 0
        ? `+${fmtPromedio(vsPromedio)} sobre el promedio`
        : `${fmtPromedio(vsPromedio)} bajo el promedio`;

  return (
    <AppShell>
      <div className="wrap">
        <div className="head">
          <div>
            <div className="h-title">Pulso del equipo</div>
            <div className="panel-sub">
              Ventana de promedio: <span className="mono">{desde}</span> a <span className="mono">{hasta}</span> ({DIAS_HABILES} días hábiles)
            </div>
          </div>
          <div className="h-meta">{usuario.email}</div>
        </div>

        <section className="panel-norte" aria-label="Norte: throughput">
          <div className="panel-norte-item">
            <span className="panel-label">Toques ayer</span>
            <strong className="panel-big mono">{toquesAyer}</strong>
            <span className={`panel-delta ${vsPromedio >= 0 ? "pos" : "neg"}`}>{comparacion}</span>
          </div>
          <div className="panel-norte-divider" aria-hidden="true" />
          <div className="panel-norte-item">
            <span className="panel-label">Promedio diario</span>
            <strong className="panel-big mono">{fmtPromedio(promedio)}</strong>
            <span className="panel-delta">{totalVentana} toques en la ventana</span>
          </div>
        </section>

        <div className="panel-section-label">Actividad de la semana</div>
        <section className="panel-row" aria-label="actividad">
          <div className="panel-col">
            <span className="panel-label">Leads tocados</span>
            <strong className="panel-mid mono">{leads}</strong>
          </div>

          <div className="panel-col panel-col-wide">
            <span className="panel-label">Por canal</span>
            <ul className="panel-bars">
              {CANALES.map((c) => (
                <li key={c} className="panel-bar-row">
                  <span className="panel-bar-label">{CANAL_LABEL[c] ?? c}</span>
                  <span className="panel-bar-track">
                    <span className="panel-bar-fill" style={{ width: `${(porCanal[c] / maxCanal) * 100}%` }} />
                  </span>
                  <span className="panel-bar-value mono">{porCanal[c]}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel-col panel-col-wide">
            <span className="panel-label">Por resultado</span>
            <ul className="panel-bars">
              {RESULTADOS.map((r) => (
                <li key={r} className="panel-bar-row">
                  <span className="panel-bar-label">{RESULTADO_LABELS[r]}</span>
                  <span className="panel-bar-track">
                    <span
                      className={`panel-bar-fill panel-bar-${RESULTADO_TONO[r]}`}
                      style={{ width: `${(porResultado[r] / maxResultado) * 100}%` }}
                    />
                  </span>
                  <span className="panel-bar-value mono">{porResultado[r]}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="panel-section-label">Cadencias corriendo</div>
        <section className="panel-row" aria-label="cadencias">
          <div className="panel-col">
            <span className="panel-label">Campañas activas</span>
            <strong className="panel-mid mono">{campanas}</strong>
          </div>
          <div className="panel-col">
            <span className="panel-label">Inscripciones corriendo</span>
            <strong className="panel-mid mono">{inscripciones}</strong>
          </div>

          <div className="panel-col panel-col-wide">
            <span className="panel-label">Empresas por cadencia</span>
            {cadencias.length === 0 ? (
              <span className="panel-vacio">Ninguna cadencia con inscripciones activas.</span>
            ) : (
              <ul className="panel-bars">
                {cadencias.map((c) => (
                  <li key={c.cadencia} className="panel-bar-row">
                    <span className="panel-bar-label">{c.cadencia}</span>
                    <span className="panel-bar-track">
                      <span className="panel-bar-fill" style={{ width: `${(c.empresas / maxCadencia) * 100}%` }} />
                    </span>
                    <span className="panel-bar-value mono">{c.empresas}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
