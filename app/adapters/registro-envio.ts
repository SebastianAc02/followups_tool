import type { EnvioAdapter, CanalEntrega } from '../core/ports/envio';
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

// Gmail Etapa 2 (2026-07-15): resuelve el adaptador de CORREO para un dueno puntual.
// Gmail verificado -> Gmail propio; sin Gmail o dueno null (campana vieja) -> Apollo,
// mismo fallback que ya describe el spec. Solo CanalEntrega (enviar) -- push.ts nunca
// necesita crearCampanaExterna/sincronizarCopy/aprobarSecuencia de correo, eso lo
// sigue resolviendo crearRegistroEnvio() (arriba) para quien de verdad lo necesita
// (campanas/actions.ts, tareaTracking).
export function resolverAdaptadorCorreo(idUsuarioDueno: string | null): CanalEntrega {
  if (idUsuarioDueno && gmailVerificadoDe(idUsuarioDueno)) return crearGmailAdapter(idUsuarioDueno);
  return crearApolloAdapter();
}

export type GrupoPendientesCorreo = { adaptador: CanalEntrega; idUsuarioGmail: string | null; filas: FilaPasoInscripcion[] };

export type DepsAgruparCorreo = {
  pendientes: (ahora: string) => FilaPasoInscripcion[];
  idUsuarioDeOwner: (owner: string | null, idOrganizacion: number) => string | null;
  gmailVerificado: (idUsuario: string) => boolean;
  crearGmail: (idUsuario: string) => CanalEntrega;
  crearApollo: () => CanalEntrega;
};

const depsAgruparCorreoReales: DepsAgruparCorreo = {
  pendientes: (ahora) => pasoInscripcionesPendientes('correo', ahora),
  idUsuarioDeOwner,
  gmailVerificado: gmailVerificadoDe,
  crearGmail: crearGmailAdapter,
  crearApollo: crearApolloAdapter,
};

// Agrupa las filas de correo pendientes por ADAPTADOR RESUELTO (una entrada por Gmail
// de un dueno distinto + una entrada "apollo" que junta a todos los que caen a
// fallback), no por campana -- dos campanas del mismo dueno con Gmail comparten un
// solo grupo/una sola llamada a pushPendientes. El gate de aprobacion (piece 4 del
// spec) vive aca: una fila cuyo dueno resuelve a Gmail pero aprobadaEnvioGmail=false
// se descarta ENTERA (no sale, ni por Gmail ni por Apollo -- si el dueno tiene Gmail,
// Apollo no es un fallback valido para SU secuencia, ver decision del plan).
export function agruparPendientesCorreo(ahora: string = new Date().toISOString(), deps: DepsAgruparCorreo = depsAgruparCorreoReales): GrupoPendientesCorreo[] {
  const filas = deps.pendientes(ahora);
  const grupos = new Map<string, GrupoPendientesCorreo>();

  for (const f of filas) {
    const idUsuario = deps.idUsuarioDeOwner(f.owner ?? null, f.idOrganizacion ?? 0);
    const esGmail = idUsuario ? deps.gmailVerificado(idUsuario) : false;

    if (esGmail && !f.aprobadaEnvioGmail) continue; // gate: sin aprobar, esta fila no sale

    const key = esGmail ? `gmail:${idUsuario}` : 'apollo';
    if (!grupos.has(key)) {
      grupos.set(key, {
        adaptador: esGmail ? deps.crearGmail(idUsuario!) : deps.crearApollo(),
        idUsuarioGmail: esGmail ? idUsuario! : null,
        filas: [],
      });
    }
    grupos.get(key)!.filas.push(f);
  }

  return [...grupos.values()];
}
