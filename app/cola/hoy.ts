// La cola del dia, compuesta en UN solo lugar (2026-08-03).
//
// Tres superficies muestran el mismo numero y hasta hoy cada una lo componia por su cuenta:
// el badge de "Toques" del nav (contaba solo colaLeads), el contador del home (leads +
// cierres + reagendar + cadencias) y la pantalla /cola (todo eso mas contacto_iniciado con
// seguimiento). Tres composiciones, tres numeros. Ahora las tres leen de aca.
//
// QUE ENTRA A LA COLA DEL DIA (regla dictada por Sebastian el 2026-08-03, mirando su
// pantalla real):
//   1. Tiene proximo paso con fecha VENCIDA O DE HOY. Sin fecha o con fecha futura no es
//      trabajo de hoy: sale en su propia seccion (colaSinProximoPaso / colaProgramadas).
//   2. Es del owner.
//   3. Su estado admite toque: on_hold y firma_pago NUNCA, por ninguna puerta
//      (estadoEntraAToques, app/db/funnel.ts). contacto_iniciado siempre. Los avanzados
//      siempre. 'lead' solo con inscripcion activa, que ya lo resuelve colaLeads.
//
// La puerta que estaba abierta era la de las cadencias: agendaHoyCadencias levanta pasos de
// inscripcion sin mirar estado_notion, asi que las on_hold entraban por ahi saltandose la
// exclusion que colaDelDia si aplica. El 2026-08-03 eran 43 de las 66 filas de la pantalla,
// y las cinco primeras (SILCOM, ITELKOM, Segitel, ITEC SOLUTIONS, REDES Y
// TELECOMUNICACIONES) eran el paso de apertura de "Precio ISPs B", vencido hace 6 dias.
//
// El filtro va aca y NO dentro de agendaHoyCadencias a proposito: la campana de reactivacion
// apunta a on_hold deliberadamente, y sus envios y su caja de aprobacion de copys tienen que
// seguir corriendo. Lo que cambia es que ese trabajo deja de contarse como toque del dia.
import {
  colaDelDia,
  colaLeads,
  colaCierres,
  colaReagendar,
  colaContactoIniciadoConSeguimiento,
  agendaHoyCadencias,
} from '../db/repository';
import { estadoEntraAToques } from '../db/funnel';
import { OWNER_COLA_SPLIT, bucketDeEtapa, type FilaColaConBucket } from './agenda.ts';

export type PasoAgenda = ReturnType<typeof agendaHoyCadencias>[number];

// Una cuenta que un paso de cadencia habria metido a Toques y que su estado deja afuera.
// Existe para que la exclusion sea visible: un descarte que no se ve es un descarte
// silencioso, y eso es lo que se estaba arreglando.
export type FilaFueraDeToques = {
  id: string;
  empresa: string;
  ciudad: string | null;
  estado: string | null;
  campana: string | null;
  fecha: string | null;
};

export type ColaDeHoy = {
  // El trabajo del dia. Todas las filas tienen fecha != null y <= hoy.
  filas: FilaColaConBucket[];
  // Los pasos que se muestran en su propia caja (CadenciasHoy) y NO cuentan como toques:
  // manual + batch en el split (aprobar copys de un lote), todos los pasos fuera del split.
  cadenciasAparte: PasoAgenda[];
  // Cuentas en on_hold/firma_pago con paso de cadencia vencido. Fuera del contador, visibles.
  enHold: FilaFueraDeToques[];
};

function esCajaDeAprobacion(p: PasoAgenda): boolean {
  return p.esManual === 1 && p.modo === 'batch';
}

function filaDePaso(p: PasoAgenda): FilaColaConBucket {
  return {
    id: p.idEmpresa,
    empresa: p.empresaNombre,
    ciudad: p.ciudad,
    contacto: p.nombre,
    cargo: null,
    canal: p.canal,
    estado: p.estadoNotion,
    fecha: p.fechaProgramada ? p.fechaProgramada.slice(0, 10) : null,
    campana: p.nombreCampana,
    bucket: bucketDeEtapa(p.estadoNotion),
    origen: 'cadencia',
  };
}

export function cargarColaDeHoy(hoy: string, owner: string | undefined, idOrganizacion: number): ColaDeHoy {
  const splitActivo = owner === OWNER_COLA_SPLIT;
  // Sin split, las cadencias se muestran completas en su caja y no entran a la lista: se deja
  // igual que estaba para no cambiarle la pantalla a los demas owners en este mismo cambio.
  const pasos = agendaHoyCadencias(hoy, splitActivo ? owner : undefined);

  if (!splitActivo) {
    return {
      filas: (owner || owner === undefined ? colaDelDia(hoy, owner, idOrganizacion) : []).map(
        (c): FilaColaConBucket => ({ ...c, bucket: 'lead' }),
      ),
      cadenciasAparte: pasos,
      enHold: [],
    };
  }

  const cadenciasAparte = pasos.filter(esCajaDeAprobacion);
  const unificables = pasos.filter((p) => !esCajaDeAprobacion(p));
  const admitidos = unificables.filter((p) => estadoEntraAToques(p.estadoNotion));

  const enHold: FilaFueraDeToques[] = [];
  const yaVistas = new Set<string>();
  for (const p of unificables) {
    if (estadoEntraAToques(p.estadoNotion) || yaVistas.has(p.idEmpresa)) continue;
    yaVistas.add(p.idEmpresa);
    enHold.push({
      id: p.idEmpresa,
      empresa: p.empresaNombre,
      ciudad: p.ciudad,
      estado: p.estadoNotion,
      campana: p.nombreCampana,
      fecha: p.fechaProgramada ? p.fechaProgramada.slice(0, 10) : null,
    });
  }

  const filas: FilaColaConBucket[] = [
    ...colaLeads(hoy, owner, idOrganizacion).map((c): FilaColaConBucket => ({ ...c, bucket: 'lead' })),
    ...colaCierres(hoy, owner, idOrganizacion).map((c): FilaColaConBucket => ({ ...c, bucket: 'cierre' })),
    ...colaReagendar(hoy, owner, idOrganizacion).map((c): FilaColaConBucket => ({ ...c, bucket: 'reagendar' })),
    // bucket 'lead': contacto_iniciado no es estado caliente, la misma clasificacion que le
    // daria bucketDeEtapa.
    ...colaContactoIniciadoConSeguimiento(hoy, owner, idOrganizacion).map(
      (c): FilaColaConBucket => ({ ...c, bucket: 'lead' }),
    ),
    ...admitidos.map(filaDePaso),
  ];

  // Cinturon sobre la regla 1: las cinco consultas ya filtran por fecha, y aun asi la lista
  // se corta aca. Si mañana alguien afloja una, el contador no se vuelve a inflar en silencio.
  const deHoy = filas.filter((f) => f.fecha != null && f.fecha <= hoy);

  // Una cuenta, una fila. Un deal caliente que ademas esta en campana salia dos veces (fila
  // de cierre + paso de cadencia): dos filas, un solo trabajo, el contador inflado en uno y
  // dos elementos con la misma key en la lista. Caso real el 2026-08-03: TELNET TV SAS.
  // Gana la primera, y el orden de arriba no es casual: la fila directa sabe en que etapa
  // esta el deal y ya trae el nombre de la campana por su join, asi que no se pierde nada.
  const unaPorCuenta = new Map<string, FilaColaConBucket>();
  for (const f of deHoy) if (!unaPorCuenta.has(f.id)) unaPorCuenta.set(f.id, f);

  return { filas: [...unaPorCuenta.values()], cadenciasAparte, enHold };
}
