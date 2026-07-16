// Core (puro): veredictos sobre el ciclo de vida de una campana. No importa DB ni
// adaptadores -- recibe el estado y devuelve el juicio, igual que readiness-canal-usuario.
//
// Contexto (2026-07-15, bug "campana zombi" medido en la demo):
// materializarPasosDebidos solo trabaja inscripciones donde inscripcion.estado='activa'
// Y campana.estado='activa'. Entonces una inscripcion 'activa' bajo una campana que NO
// esta activa esta viva pero es invisible: nadie la materializa, nada la cierra, y ocupa
// el cupo de "una activa por empresa" (indice unico parcial ux_inscripcion_activa).
//
// Los estados que hoy existen en campana.estado:
//   'borrador'  -> nunca se lanzo (no tiene inscripciones)
//   'activa'    -> corriendo
//   'pausada'   -> congelada, REVERSIBLE (reanudarCampana la vuelve a 'activa')
//   'archivada' -> TERMINAL, sin vuelta atras (Apollo no tiene unarchive por API)

export type EstadoCampana = 'borrador' | 'activa' | 'pausada' | 'archivada';

// La cola de revision ("Por revisar") ofrece las inscripciones 'bloqueada' para que
// alguien les elija un contacto a mano; resolverla la promueve a 'activa'.
//
// TODO (Sebastián): la regla es tuya, porque es de negocio, no de codigo.
// ¿Bajo que estados de campana tiene sentido resolver una bloqueada?
//
// El trade-off real esta entre 'pausada' y 'archivada':
//  - 'archivada' es terminal: resolver ahi produce exactamente el zombi (activa que el
//    motor nunca mira). Esto no se discute, hay que cortarlo.
//  - 'pausada' es reversible: la inscripcion resuelta se queda quieta hasta que
//    reanudes, y ahi arranca sola. Permitirlo deja adelantar trabajo de revision
//    mientras la campana esta en pausa; prohibirlo es mas simple de explicar
//    ("solo se resuelve lo que esta corriendo") pero te obliga a reanudar para poder
//    limpiar la cola, y la bloqueada te sigue apareciendo ahi mientras tanto.
//
// Devuelve el motivo cuando NO se puede: la UI lo muestra tal cual, asi que escribilo
// como se lo dirias a alguien que acaba de darle click y no entiende por que no pasa nada.
export type VeredictoResolver = { puede: true } | { puede: false; motivo: string };

// SIN IMPLEMENTAR A PROPOSITO (2026-07-16): nadie la importa todavia. Vive aca como el
// lugar donde va la regla cuando Sebastián la decida, no como codigo muerto. El zombi que
// SI se podia cerrar sin decision suya ya esta tapado en marcarCampanaFinalizada
// (repository.ts): cancelar cierra los dos estados vivos. Lo que falta es el camino del
// worker (ver el test en todo de repository.campanaZombi.test.ts).
export function puedeResolverBloqueada(_estado: EstadoCampana): VeredictoResolver {
  // 5-10 lineas: tu regla aca. Ver el trade-off pausada/archivada arriba.
  throw new Error('puedeResolverBloqueada: sin implementar, falta la regla de Sebastián');
}
