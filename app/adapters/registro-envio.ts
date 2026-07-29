import type { EnvioAdapter, CanalEntrega, TrackingPoll } from '../core/ports/envio';
import type { Canal } from '../db/validation';
import { CANALES_AUTOMATICOS } from '../db/validation';
import { crearApolloAdapter } from './apollo';
import { crearEvolutionAdapter } from './evolution';
import { crearGmailAdapter } from './gmail';
import { gmailVerificadoDe, idUsuarioDeOwner, pasoInscripcionesPendientes } from '../db/repository';
import type { FilaPasoInscripcion } from '../core/push';

// Registro canal -> proveedor real (sesion 2026-07-09, pedido explicito de Sebastian:
// SOLID, cada canal cambia de proveedor sin tocar el core). Este es el UNICO lugar del
// proyecto que decide "que proveedor manda este canal" -- push.ts y tracking.ts nunca
// conocen Apollo ni Evolution por nombre, reciben el adaptador ya resuelto.
//
// correo -> Apollo, unico proveedor con los TRES roles (EnvioAdapter completo: envia,
//   trackea, administra la secuencia externa) -- por eso .correo es el unico que
//   cancelarCampanaAction/sincronizarCopyApolloAction/tareaTracking pueden usar.
// llamada -> null A PROPOSITO: no es una limitacion temporal, es la decision de
//   Sebastian de que el sea el "proveedor" de llamada. Un paso de canal=llamada
//   nunca deberia ser automatico (ver CANALES_AUTOMATICOS en db/validation.ts) --
//   siempre espera revision humana en /cola (aprobarPasoManual), que ya es esa via.
// whatsapp -> Evolution (sesion 2026-07-09, tarea B2 prueba multicanal). Evolution
//   solo implementa CanalEntrega (no tiene secuencia externa ni tracking propio por
//   API -- las respuestas entran por webhook, ver core/llego-respuesta.ts), asi que
//   el tipo de retorno deja de ser un Record uniforme: cada canal declara el rol que
//   de verdad cumple, y TypeScript avisa si algun caller intenta pedirle a whatsapp
//   un metodo de MotorSecuencia/TrackingPoll que no tiene.
export function crearRegistroEnvio(): { correo: EnvioAdapter; whatsapp: CanalEntrega; llamada: null } {
  return {
    correo: crearApolloAdapter(),
    whatsapp: crearEvolutionAdapter(),
    llamada: null,
  };
}

// crearRegistroEntrega (checkpoint 2026-07-09, deadline explicito de Sebastian, misma
// excepcion puntual al modo learning documentada en core/ports/envio.ts): angosta el
// registro a CanalEntrega para el UNICO consumidor generico por canal (tareasPush en
// worker/index.ts, que hoy loopea sobre los 3 canales sin saber que Apollo existe).
// crearRegistroEnvio() (arriba) sigue igual y se queda como la via para quien necesita
// el EnvioAdapter completo de correo (tareaTracking, campanas/[id]/actions.ts): esos dos
// consumidores solo le preguntan por 'correo', nunca por whatsapp/llamada, asi que no
// ganan nada angostando -- partir el registro en dos funciones es mas simple que un tipo
// por-clave dentro de un mismo Record, y dice la verdad: "registro de entrega" (todo
// canal, solo enviarPaso) y "adaptador de correo completo" son dos preguntas distintas.
export function crearRegistroEntrega(): Record<Canal, CanalEntrega | null> {
  return crearRegistroEnvio();
}


// Re-exportado por conveniencia (import { CANALES_AUTOMATICOS } from '.../registro-envio'
// donde ya se esta importando crearRegistroEnvio); la fuente real vive en db/validation.ts,
// ver el comentario ahi para el motivo de la direccion de dependencia.
export { CANALES_AUTOMATICOS };

// LA decision de "quien manda/lee el correo de este dueno", en un solo lugar (2026-07-28).
// Antes vivia copiada en tres sitios: resolverAdaptadorCorreo, agruparPendientesCorreo y
// -- por omision -- el poll de tracking, que ni siquiera preguntaba y asumia Apollo para
// TODA campana. Esa asimetria es la que dejaba una respuesta por correo sin cortar la
// cadencia: se mandaba por Gmail y se leia por Apollo.
//
// Devuelve el veredicto, no el adaptador, a proposito: el camino de ENVIO necesita un
// CanalEntrega y el de LECTURA un TrackingPoll, dos interfaces distintas del mismo
// proveedor. Con el veredicto separado, los dos caminos comparten el criterio sin
// compartir el tipo de retorno, y agregar un tercer rol no obliga a tocar la decision.
//
// gmailVerificado se inyecta para que agruparPendientesCorreo pase el suyo (tests) sin
// que exista una segunda forma de decidir.
export type ProveedorCorreo = { proveedor: 'gmail'; idUsuario: string } | { proveedor: 'apollo'; idUsuario: null };

export function decidirProveedorCorreo(
  idUsuarioDueno: string | null,
  gmailVerificado: (idUsuario: string) => boolean = gmailVerificadoDe,
): ProveedorCorreo {
  if (idUsuarioDueno && gmailVerificado(idUsuarioDueno)) return { proveedor: 'gmail', idUsuario: idUsuarioDueno };
  return { proveedor: 'apollo', idUsuario: null };
}

// Gmail Etapa 2 (2026-07-15): resuelve el adaptador de CORREO para un dueno puntual.
// Gmail verificado -> Gmail propio; sin Gmail o dueno null (campana vieja) -> Apollo,
// mismo fallback que ya describe el spec. Solo CanalEntrega (enviar) -- push.ts nunca
// necesita crearCampanaExterna/sincronizarCopy/aprobarSecuencia de correo, eso lo
// sigue resolviendo crearRegistroEnvio() (arriba) para quien de verdad lo necesita
// (campanas/actions.ts, tareaTracking).
export function resolverAdaptadorCorreo(idUsuarioDueno: string | null): CanalEntrega {
  const veredicto = decidirProveedorCorreo(idUsuarioDueno);
  return veredicto.proveedor === 'gmail' ? crearGmailAdapter(veredicto.idUsuario) : crearApolloAdapter();
}

// El espejo de resolverAdaptadorCorreo del lado de LECTURA (2026-07-28). Misma decision,
// otro rol: TrackingPoll en vez de CanalEntrega.
//
// Devuelve tambien el NOMBRE del proveedor porque quien pollea necesita dos cosas que el
// adaptador no dice: que referencia pasarle (Apollo lee por secuencia, Gmail por hilo --
// ver worker/index.ts) y con que etiquetar el error cuando una campana falla. Un adaptador
// anonimo obliga a un instanceof o a un segundo `if`, o sea a decidir el proveedor dos veces.
export function resolverTrackingCorreo(idUsuarioDueno: string | null): { proveedor: 'gmail' | 'apollo'; adaptador: TrackingPoll } {
  const veredicto = decidirProveedorCorreo(idUsuarioDueno);
  return veredicto.proveedor === 'gmail'
    ? { proveedor: 'gmail', adaptador: crearGmailAdapter(veredicto.idUsuario) }
    : { proveedor: 'apollo', adaptador: crearApolloAdapter() };
}

export type GrupoPendientesCorreo = { adaptador: CanalEntrega; idUsuarioGmail: string | null; filas: FilaPasoInscripcion[] };

export type DepsAgruparCorreo = {
  pendientes: (ahora: string) => FilaPasoInscripcion[];
  idUsuarioDeOwner: (owner: string | null, idOrganizacion: number) => string | null;
  gmailVerificado: (idUsuario: string) => boolean;
  crearGmail: (idUsuario: string) => CanalEntrega;
  crearApollo: () => CanalEntrega;
  // Se llama por CADA fila que el gate descarta. Existe porque el descarte era un `continue`
  // pelado: la fila no salia, no se marcaba 'fallo', no se logueaba, y se quedaba 'pendiente'
  // para siempre. Un correo que muere sin dejar rastro es indistinguible de uno que todavia no
  // le toca, y esa es la unica diferencia que importa cuando alguien pregunta "¿se mandó?".
  onDescartada?: (fila: FilaPasoInscripcion, motivo: string) => void;
};

const depsAgruparCorreoReales: DepsAgruparCorreo = {
  pendientes: (ahora) => pasoInscripcionesPendientes('correo', ahora),
  idUsuarioDeOwner,
  gmailVerificado: gmailVerificadoDe,
  crearGmail: crearGmailAdapter,
  crearApollo: crearApolloAdapter,
  onDescartada: (fila, motivo) => {
    console.error(
      `[correo] paso_inscripcion ${fila.idPasoInscripcion} (${fila.destinatario.empresa ?? 'sin empresa'} <${fila.destinatario.email ?? 'sin email'}>) ` +
        `NO se envia y queda 'pendiente': ${motivo}`,
    );
  },
};

// Agrupa las filas de correo pendientes por ADAPTADOR RESUELTO (una entrada por Gmail
// de un dueno distinto + una entrada "apollo" que junta a todos los que caen a
// fallback), no por campana -- dos campanas del mismo dueno con Gmail comparten un
// solo grupo/una sola llamada a pushPendientes. El gate de aprobacion (piece 4 del
// spec) vive aca: una fila cuyo dueno resuelve a Gmail pero aprobadaEnvioGmail=false
// se descarta ENTERA (no sale, ni por Gmail ni por Apollo -- si el dueno tiene Gmail,
// Apollo no es un fallback valido para SU secuencia, ver decision del plan).
//
// deps es PARCIAL (2026-07-28, empujon-manual.ts): lo que no se pasa cae a la dep real. Existe
// para que el empujon manual acotado pueda pisar SOLO `pendientes` (la cola global por la lista
// de ids que le dieron) sin tener que repetir las otras cuatro, que son justo las que deciden el
// proveedor y aplican el gate de aprobacion. Un caller que las repitiera seria un caller que
// puede desviar el correo a otro adaptador sin querer.
export function agruparPendientesCorreo(ahora: string = new Date().toISOString(), deps: Partial<DepsAgruparCorreo> = {}): GrupoPendientesCorreo[] {
  const d: DepsAgruparCorreo = { ...depsAgruparCorreoReales, ...deps };
  const filas = d.pendientes(ahora);
  const grupos = new Map<string, GrupoPendientesCorreo>();

  for (const f of filas) {
    const idUsuario = d.idUsuarioDeOwner(f.owner ?? null, f.idOrganizacion ?? 0);
    // Misma decision que usa el poll de tracking (decidirProveedorCorreo), no una copia:
    // el dia que el criterio cambie, envio y lectura cambian juntos o no cambia ninguno.
    const esGmail = decidirProveedorCorreo(idUsuario, d.gmailVerificado).proveedor === 'gmail';

    // Gate: sin aprobar, esta fila no sale. Ya NO en silencio -- se avisa antes de saltarla.
    // El aviso no cambia el comportamiento del gate a proposito: el gate esta bien (nadie
    // quiere que una campana sin revisar salga sola), lo que estaba mal era que cortara sin
    // decirlo. Quien lo arregla de verdad es armar la campana (aprobada_envio_gmail=1), y eso
    // es una decision de quien lanza, no del worker.
    if (esGmail && !f.aprobadaEnvioGmail) {
      d.onDescartada?.(
        f,
        `campana.aprobada_envio_gmail=0 y el dueno '${f.owner ?? 'sin owner'}' manda por Gmail. ` +
          'Se arma con lanzar_campana, con cambiar_cadencia armarEnvioCorreo:true, o con "Lanzar hoy" en la web',
      );
      continue;
    }

    const key = esGmail ? `gmail:${idUsuario}` : 'apollo';
    if (!grupos.has(key)) {
      grupos.set(key, {
        adaptador: esGmail ? d.crearGmail(idUsuario!) : d.crearApollo(),
        idUsuarioGmail: esGmail ? idUsuario! : null,
        filas: [],
      });
    }
    grupos.get(key)!.filas.push(f);
  }

  return [...grupos.values()];
}
