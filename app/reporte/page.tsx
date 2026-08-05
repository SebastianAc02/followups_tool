import { requireSession } from '../lib/session';
import { hoy as hoyDelRequest } from '../lib/reloj';
import { AppShell } from '../ui/shell/AppShell';
import { toquesParaActividadCanal, toquesEnRango, ownersConToques } from '../db/repository';
import { planVsEjecutadoTool } from '../mcp/tools';
import { reporteDelDia, vistaDeEquipo, nivelPara, type ToqueReporteCanal, type ToquesReporteDia } from '../core/reporte-dia';
import type { ToqueCanal } from '../core/actividad-canal';
import type { ToqueDashboardCRO } from '../core/dashboard-cro';
import { ReporteCompletoVista, ReporteEquipoVista } from './Vistas';

// El reporte del dia de UN operador. Dos niveles de detalle segun quien mire, decididos ACA, en el
// servidor: el nivel de equipo se construye como objeto distinto y es lo unico que cruza al cliente.
//
// Es deliberado que el filtro no viva en el componente. Un reporte completo que viaja al navegador y
// se esconde en el render esta a un "ver codigo fuente" de no estar escondido, y esto es observacion
// sobre el trabajo de una persona.
//
// La fecha sale de hoy() (reloj de demo por request) y nunca de `new Date()`: en modo prueba la
// fecha real y la simulada difieren, y este mismo error ya se corrigio dos veces en este repo.

export default async function Reporte({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; dia?: string }>;
}) {
  const usuario = await requireSession();
  const params = await searchParams;
  const dia = params.dia || hoyDelRequest();
  // Sin `owner` el reporte es el de quien mira, que es el caso normal. Con owner, es el de otra
  // persona y casi siempre va a caer en nivel de equipo.
  const owner = params.owner || usuario.owner;

  // Dos lecturas del mismo `toque` (mismo dia, mismo owner, mismo join): ninguna trae sola todas
  // las columnas que el reporte necesita -- toquesParaActividadCanal trae esPrimerToqueDeLaCuenta
  // y origenLead pero no tipoToque/reunionFechaOcurrida, toquesEnRango es al reves. Se combinan
  // como dos arreglos (no se fusionan fila a fila: ninguna de las dos trae idToque en su tipo de
  // salida y ademas vienen en orden distinto). Ver el comentario largo en core/reporte-dia.ts.
  const filasCanal: ToqueReporteCanal[] = toquesParaActividadCanal(dia, dia, usuario.idOrganizacion, { owner }).map((f) => ({
    ...f,
    resultado: f.resultado as ToqueCanal['resultado'],
  }));
  const filasDashboard: ToqueDashboardCRO[] = toquesEnRango(dia, dia, usuario.idOrganizacion, { owner }).map((t) => ({
    idEmpresa: t.idEmpresa,
    canal: t.canal,
    tipoToque: t.tipoToque,
    resultado: t.resultado as ToqueDashboardCRO['resultado'],
    fuente: t.fuente,
    fechaDia: t.fechaDia,
    fecha: t.fecha,
    estado: t.estado,
    reunionFechaPropuesta: t.reunionFechaPropuesta,
    reunionFechaOcurrida: t.reunionFechaOcurrida,
  }));
  const toques: ToquesReporteDia = { canal: filasCanal, dashboard: filasDashboard };

  // planVsEjecutadoTool ya existe en el MCP y responde exactamente "cuantos estaban planeados y
  // no salieron" -- no se reimplementa el cruce contra toque_planeado aca.
  const plan = planVsEjecutadoTool({ desde: dia, owner, idOrganizacion: usuario.idOrganizacion });

  const completo = reporteDelDia(toques, { planeados: plan.total.planeados, ejecutados: plan.total.ejecutados }, { dia, owner });
  const nivel = nivelPara(usuario, owner);

  const owners = ownersConToques();

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-body text-xl font-semibold text-foreground">Reporte del día</h1>
            <p className="font-body text-sm text-muted-foreground">
              {owner} · <span className="font-mono">{dia}</span>
            </p>
          </div>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <select
              name="owner"
              defaultValue={owner}
              aria-label="De quién es el reporte"
              className="rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground"
            >
              {[owner, ...owners.filter((o) => o !== owner)].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <input
              type="date"
              name="dia"
              defaultValue={dia}
              aria-label="Día"
              className="rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground"
            />
            <button
              type="submit"
              className="rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-foreground hover:border-primary hover:text-primary"
            >
              Ver
            </button>
          </form>
        </header>

        {nivel === 'completo' ? (
          <ReporteCompletoVista reporte={completo} />
        ) : (
          <ReporteEquipoVista reporte={vistaDeEquipo(completo)} />
        )}
      </div>
    </AppShell>
  );
}
