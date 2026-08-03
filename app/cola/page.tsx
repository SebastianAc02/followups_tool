import {
  colaSinProximoPaso,
  colaProgramadas,
  colaContactoIniciadoSinSeguimiento,
  contadoresHoy,
  historialPasosDestinatario,
  empresasConRespuestaPendiente,
  resumenTrackingPorEmpresa,
} from "../db/repository";
import { resumirTracking } from "../core/resumen-tracking.ts";
import { registrarTapAction } from "../actions";
import { requireSession } from "../lib/session";
import { AppShell } from "../ui/shell/AppShell";
import { StatCard } from "../ui/home/StatCard";
import CadenciasHoy from "./CadenciasHoy";
import { BarraAhora } from "./BarraAhora";
import { AgendaHoy } from "./AgendaHoy";
import { ColaUnificada } from "./ColaUnificada";
import { ContactoIniciadoSinSeguimiento } from "./ContactoIniciadoSinSeguimiento";
import { SeccionFueraDeHoy } from "./SeccionFueraDeHoy";
import { contarToquesHoy } from "./stats";
import { cargarColaDeHoy } from "./hoy.ts";
import {
  filaConVencimiento,
  unificarCola,
  vencidasDeHoy,
  OWNER_COLA_SPLIT,
  type FilaAgenda,
  type FilaColaConBucket,
} from "./agenda.ts";
import { hoy as hoyDemo } from "../lib/reloj";

export default async function Cola({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  // Pipeline compartido (B3 v1): cualquier autenticado puede MIRAR la cola de otro por
  // ?owner=, pero el default es el owner de la sesion, ya no OWNERS[0]. Visitante (solo
  // lectura) sin ?owner= ve la cola de TODOS los owners, no una propia (que estaria vacia).
  // verTodoPipeline (CRO, Fase 3): mismo default que el visitante -- sin ?owner= ve TODOS
  // los owners, Felipe y Sebastian incluidos, sin perder su propio owner si algo se lo pide.
  const owner = sp.owner ?? (usuario.soloLectura || usuario.verTodoPipeline ? undefined : usuario.owner);
  const hoy = hoyDemo();
  const splitActivo = owner === OWNER_COLA_SPLIT;

  // La cola del dia sale de UNA composicion (app/cola/hoy.ts), la misma que cuenta el badge
  // del nav y el contador del home. Todas sus filas tienen fecha vencida o de hoy y estado
  // que admite toque: on_hold y firma_pago no entran por ninguna puerta, ni por cadencias.
  const { filas: filasDeHoy, cadenciasAparte, enHold } = cargarColaDeHoy(hoy, owner, usuario.idOrganizacion);

  // Lo que NO es trabajo de hoy y aun asi no puede desaparecer. Cada lista con su motivo.
  const sinProximoPaso = splitActivo ? colaSinProximoPaso(owner, usuario.idOrganizacion) : [];
  const programadas = splitActivo ? colaProgramadas(hoy, owner, usuario.idOrganizacion) : [];
  // Seccion "Contacto iniciado sin seguimiento" (2026-07-14): para CUALQUIER owner, no
  // solo el split de Sebastian. Sin owner por ser visitante, la seccion simplemente no se
  // muestra (decision anterior de Sebastian: un visitante no tiene "lo suyo" que completar).
  // Sin owner por ser CRO (Fase 3), si se muestra: org-wide, la misma seccion pero de
  // Felipe + Sebastian juntos -- es lectura, exactamente lo que el CRO pidio ver.
  const sinSeguimiento = owner
    ? colaContactoIniciadoSinSeguimiento(owner, usuario.idOrganizacion)
    : usuario.verTodoPipeline
      ? colaContactoIniciadoSinSeguimiento(undefined, usuario.idOrganizacion)
      : [];
  const contadores = contadoresHoy(hoy, owner, usuario.idOrganizacion);

  // Parte 4 campanas: el historial (dias ya tocados) solo tiene sentido para los manuales --
  // son los unicos con boton de "Aprobar" que necesita saber en que paso va el lead.
  const cadenciasHoy = cadenciasAparte.map((t) => ({
    ...t,
    historial: t.esManual === 1 ? historialPasosDestinatario(t.idDestinatario) : [],
  }));

  const respuestasPendientes = new Set(empresasConRespuestaPendiente(usuario.idOrganizacion).map((f) => f.idEmpresa));
  const filasParaUnificar: FilaColaConBucket[] = filasDeHoy.map((f) => ({
    ...f,
    respuestaPendiente: respuestasPendientes.has(f.id),
  }));

  // Tracking por empresa para el pill "abrió/vio/clic" (2026-07-15). Un solo query para toda
  // la cola; el core (resumirTracking) decide texto y temperatura. El reloj de demo (hoyDemo)
  // NO aplica: la hora de "hace 2h" es tiempo real de reloj, no la fecha de negocio, por eso
  // ahora = new Date() y no hoyDemo(). resumenTrackingPorEmpresa([]) no toca la DB.
  const trackingPorEmpresa = resumenTrackingPorEmpresa(filasParaUnificar.map((f) => f.id));
  const ahora = new Date();
  const filasConTracking: FilaColaConBucket[] = filasParaUnificar.map((f) => {
    const s = trackingPorEmpresa.get(f.id);
    return s ? { ...f, tracking: resumirTracking(s, ahora) } : f;
  });

  const filasUnificadas = splitActivo ? unificarCola(filasConTracking, hoy) : [];
  const filas: FilaAgenda[] = splitActivo ? [] : filasConTracking.map((c, i) => filaConVencimiento(c, hoy, i === 0));

  // El contador de arriba ES la lista de abajo (2026-08-03). Antes contaba sobre filas que
  // incluian fecha futura y sin fecha, asi que no podia llegar a cero por definicion: 39
  // cuentas org-wide aparecian todos los dias y no bajaban nunca. Ahora "Para hoy" = filas
  // listadas, y lo que quedo fuera se muestra abajo con su motivo escrito.
  const pendientes = filasConTracking.length;
  const vencidos = vencidasDeHoy(filasConTracking, hoy);

  // La barra "AHORA" sale de la lista unificada, no de cola[0]: con 0 leads y un WhatsApp
  // debido, cola[0] era undefined y la barra desaparecia aunque hubiera trabajo. unificarCola
  // ya ordena por urgencia, asi que su primera fila ES el siguiente toque.
  const actual = splitActivo ? filasUnificadas[0] : filas[0];

  const toquesHoy = contarToquesHoy(contadores);

  return (
    <AppShell>
      <div className="mb-8">
        {/* El titulo dice lo que la lista trae de verdad: lo vencido y lo de hoy, del owner.
            Lo que no es de hoy (sin fecha, programado, en hold) vive en sus secciones de
            abajo, fuera del contador. */}
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">{splitActivo ? "Tus toques" : "Toques de hoy"}</h2>
        <p className="mt-1 text-sm text-muted">Lo vencido y lo de hoy. Nada más.</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Para hoy" valor={pendientes} sub={pendientes > 0 ? "en la lista de abajo" : "al día"} />
        <StatCard label="Programadas" valor={programadas.length} sub="con fecha futura" />
        <StatCard
          label="Toques hoy"
          valor={toquesHoy}
          // Los mensajes que MANDA el ISP no son actividad del operador (2026-07-27): un
          // hilo entero de respuestas del cliente antes se colaba en "Cerradas" y lo
          // inflaba sin que el operador tocara nada. Se muestran aparte, informativos.
          sub={contadores.entrantes > 0 ? `+${contadores.entrantes} respuestas` : "hoy"}
          tone="done"
          subTone="done"
        />
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
          badge={actual.badge}
          severidadTexto={actual.severidadTexto}
        />
      )}

      <section id="today-agenda">
        {splitActivo ? (
          filasUnificadas.length === 0 ? (
            <div className="rounded-xl border border-line-card bg-card py-8 text-center text-[13px] text-muted">
              Sin follow-ups pendientes. Buen trabajo.
            </div>
          ) : (
            <ColaUnificada filas={filasUnificadas} registrarTapAction={registrarTapAction} />
          )
        ) : filas.length === 0 ? (
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
      </section>

      <SeccionFueraDeHoy
        titulo="Sin próximo paso decidido"
        descripcion="Deals abiertos a los que les falta decidir el siguiente movimiento. Ponles fecha y entran a tu cola."
        filas={sinProximoPaso}
      />

      {owner && <ContactoIniciadoSinSeguimiento filas={sinSeguimiento} owner={owner} />}

      <SeccionFueraDeHoy
        titulo="Programadas"
        descripcion="Tienen próximo paso con fecha y todavía no llega. Aparecen en tu cola el día que les toca."
        filas={programadas}
        conAcciones={false}
      />

      <SeccionFueraDeHoy
        titulo="En hold, fuera de tu cola"
        descripcion="Tienen un paso de cadencia vencido, pero están en hold: no cuentan como toque de hoy."
        filas={enHold}
        conAcciones={false}
      />
    </AppShell>
  );
}
