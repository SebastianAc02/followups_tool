import {
  colaSinProximoPaso,
  colaProgramadas,
  colaContactoIniciadoSinSeguimiento,
  historialPasosDestinatario,
} from "../db/repository";
import { requireSession } from "../lib/session";
import { AppShell } from "../ui/shell/AppShell";
import { ContadoresTandas } from "../ui/ContadoresTandas";
import CadenciasHoy from "./CadenciasHoy";
import { ContactoIniciadoSinSeguimiento } from "./ContactoIniciadoSinSeguimiento";
import { SeccionFueraDeHoy } from "./SeccionFueraDeHoy";
import { cargarColaDeHoy } from "./hoy.ts";
import { OWNER_COLA_SPLIT } from "./agenda.ts";
import { hoy as hoyDemo } from "../lib/reloj";
import {
  cargarTandasDelDia,
  gruposLlamables,
  resolverPosicion,
  cuentaEnPosicion,
  siguientePosicion,
  fichaCuentaActual,
} from "./tandas-datos.ts";
import { TandaAvance } from "./TandaAvance";
import { CuentaActual } from "./CuentaActual";
import { ListaTanda } from "./ListaTanda";

// Pantalla 1 del rediseño de tandas (paso 6, 2026-08-04): la tanda decide el orden, el operador
// solo ejecuta. Antes esta pantalla tenía lo correcto arriba (la tarjeta de próximo paso) y
// debajo una lista de 20 cuentas que devolvía la decisión que la tarjeta acababa de quitar --
// elegir de esa lista era la fuga mental. Ahora arriba dice qué tanda se está corriendo y el
// avance dentro de ella, en el centro va UNA cuenta con lo mínimo para marcar, abajo se registra
// y se avanza sin volver a ninguna lista, y la cola completa queda detrás de un clic para saltar
// a una cuenta puntual.
export default async function Cola({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; tanda?: string; i?: string }>;
}) {
  const usuario = await requireSession();
  const sp = await searchParams;
  const owner = sp.owner ?? (usuario.soloLectura || usuario.verTodoPipeline ? undefined : usuario.owner);
  const hoy = hoyDemo();
  const splitActivo = owner === OWNER_COLA_SPLIT;

  // El MISMO cálculo que usa Seguimiento y el MCP (tandasTool): nadie arma esta lista a mano.
  const datosTandas = cargarTandasDelDia(usuario.idOrganizacion, owner);
  const grupos = gruposLlamables(datosTandas);
  const posicion = resolverPosicion(grupos, { tanda: sp.tanda, i: sp.i });
  const clasificacion = cuentaEnPosicion(grupos, posicion);
  const ficha = clasificacion ? fichaCuentaActual(clasificacion.idEmpresa, usuario.idOrganizacion) : null;
  const posicionSiguiente = siguientePosicion(grupos, posicion);
  const totalEnTanda = posicion ? (grupos.find((g) => g.tanda === posicion.tanda)?.total ?? 0) : 0;
  const totalCola = grupos.reduce((acc, g) => acc + g.total, 0);

  // Lo que NO es trabajo de hoy y aun asi no puede desaparecer. Cada lista con su motivo -- esto
  // no cambió con el rediseño, sigue siendo información distinta a "a quién llamo ahora".
  const sinProximoPaso = splitActivo ? colaSinProximoPaso(owner, usuario.idOrganizacion) : [];
  const programadas = splitActivo ? colaProgramadas(hoy, owner, usuario.idOrganizacion) : [];
  const sinSeguimiento = owner
    ? colaContactoIniciadoSinSeguimiento(owner, usuario.idOrganizacion)
    : usuario.verTodoPipeline
      ? colaContactoIniciadoSinSeguimiento(undefined, usuario.idOrganizacion)
      : [];

  // cadenciasAparte (caja de aprobación de copys) y enHold (bloqueadas por estado, visibles con
  // su motivo) siguen saliendo de la misma composición de siempre -- son cadencias del motor, no
  // parte de la clasificación en tandas.
  const { cadenciasAparte, enHold } = cargarColaDeHoy(hoy, owner, usuario.idOrganizacion);
  const cadenciasHoy = cadenciasAparte.map((t) => ({
    ...t,
    historial: t.esManual === 1 ? historialPasosDestinatario(t.idDestinatario) : [],
  }));

  return (
    <AppShell>
      <ContadoresTandas sinVerificarAliado={datosTandas.sinVerificarAliado} sinTamanoConfirmado={datosTandas.sinTamanoConfirmado} />

      {posicion && clasificacion && ficha ? (
        <>
          <TandaAvance tanda={posicion.tanda} indice={posicion.indice} total={totalEnTanda} />
          <CuentaActual
            ficha={ficha}
            clasificacion={clasificacion}
            // ?vista con el canal del proximo paso: sin esto la pantalla siempre aterrizaba en la
            // vista de llamadas, asi que una cuenta de WhatsApp o de correo obligaba a cambiar de
            // pestana a mano. decidirVista solo lo usa cuando la secuencia no tiene un paso activo
            // que mande, asi que la cadencia sigue ganando cuando la hay.
            hrefRegistrar={
              clasificacion.proximoCanal === 'whatsapp' || clasificacion.proximoCanal === 'correo'
                ? `/llamada/${clasificacion.idEmpresa}?vista=${clasificacion.proximoCanal}`
                : `/llamada/${clasificacion.idEmpresa}`
            }
            hrefSiguiente={posicionSiguiente ? `/cola?tanda=${posicionSiguiente.tanda}&i=${posicionSiguiente.indice}` : null}
          />
          <ListaTanda grupos={grupos} actual={posicion} total={totalCola} />
        </>
      ) : (
        <div className="mb-8 rounded-xl border border-line-card bg-card py-8 text-center text-[13px] text-muted">
          Sin cuentas para llamar ahora. Buen trabajo.
        </div>
      )}

      {cadenciasHoy.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-xl border border-line-card bg-card px-7 py-6">
          <CadenciasHoy items={cadenciasHoy} hoy={hoy} />
        </div>
      )}

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
