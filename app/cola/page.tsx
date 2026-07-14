import { colaDelDia, colaLeads, colaCierres, colaReagendar, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
import { registrarTapAction } from "../actions";
import { requireSession } from "../lib/session";
import { AppShell } from "../ui/shell/AppShell";
import { StatCard } from "../ui/home/StatCard";
import CadenciasHoy from "./CadenciasHoy";
import { BarraAhora } from "./BarraAhora";
import { AgendaHoy } from "./AgendaHoy";
import { contarCerradas } from "./stats";
import { filaSinVencimiento, filaConVencimiento, diasVencido, OWNER_COLA_SPLIT, type FilaAgenda } from "./agenda.ts";

export default async function Cola({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  // Pipeline compartido (B3 v1): cualquier autenticado puede MIRAR la cola de otro por
  // ?owner=, pero el default es el owner de la sesion, ya no OWNERS[0]. Visitante (solo
  // lectura) sin ?owner= ve la cola de TODOS los owners, no una propia (que estaria vacia).
  const owner = sp.owner ?? (usuario.soloLectura ? undefined : usuario.owner);
  const hoy = new Date().toISOString().slice(0, 10);
  const splitActivo = owner === OWNER_COLA_SPLIT;
  const cola = splitActivo ? colaLeads(hoy, owner, usuario.idOrganizacion) : colaDelDia(hoy, owner, usuario.idOrganizacion);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const cierres = splitActivo ? colaCierres(owner, usuario.idOrganizacion) : [];
  const reagendar = splitActivo ? colaReagendar(hoy, owner, usuario.idOrganizacion) : [];
  const contadores = contadoresHoy(hoy, owner, usuario.idOrganizacion);
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

  const filas: FilaAgenda[] = cola.map((c, i) => filaConVencimiento(c, hoy, i === 0));

  const filasCierres: FilaAgenda[] = cierres.map((c) => filaSinVencimiento(c));
  const filasReagendar: FilaAgenda[] = reagendar.map((c) => filaConVencimiento(c, hoy, false));

  const actual = cola[0];
  const diasActual = actual ? diasVencido(actual.fecha!, hoy) : 0;

  const cerradas = contarCerradas(contadores);

  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">{splitActivo ? "Leads" : "Toques de hoy"}</h2>
        <p className="mt-1 text-sm text-muted">{splitActivo ? "Leads con follow-up vencido o de hoy." : "Tu cola de follow-ups pendientes."}</p>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="Pendientes" valor={cola.length} sub="en cola" />
        <StatCard label="Cerradas" valor={cerradas} sub="hoy" tone="done" subTone="done" />
        <StatCard
          label="Vencidas"
          valor={vencidos}
          sub={vencidos > 0 ? "requieren acción" : "al día"}
          tone="overdue"
          subTone="overdue"
        />
      </div>

      {actual && (
        <BarraAhora
          id={actual.id}
          empresa={actual.empresa}
          ciudad={actual.ciudad}
          contacto={actual.contacto}
          cargo={actual.cargo}
          canal={actual.canal}
          estado={actual.estado}
          sev={diasActual > 0 ? "overdue" : "today"}
          severidadTexto={diasActual > 0 ? `vencido ${diasActual}d` : "hoy"}
        />
      )}

      <section id="today-agenda">
        {filas.length === 0 ? (
          <div className="rounded-xl border border-line-card bg-card py-8 text-center text-[13px] text-muted">
            Sin follow-ups para hoy. Buen trabajo.
          </div>
        ) : (
          <AgendaHoy filas={filas} registrarTapAction={registrarTapAction} />
        )}

        {cadenciasHoy.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-line-card bg-card px-7 py-6">
            <CadenciasHoy items={cadenciasHoy} hoy={hoy} />
          </div>
        )}

        {splitActivo && filasCierres.length > 0 && (
          <div className="mt-8">
            <h3 className="font-serif text-lg text-ink mb-3">Cierres</h3>
            <AgendaHoy filas={filasCierres} registrarTapAction={registrarTapAction} />
          </div>
        )}

        {splitActivo && filasReagendar.length > 0 && (
          <div className="mt-8">
            <h3 className="font-serif text-lg text-ink mb-3">Reagendar</h3>
            <AgendaHoy filas={filasReagendar} registrarTapAction={registrarTapAction} />
          </div>
        )}
      </section>
    </AppShell>
  );
}
