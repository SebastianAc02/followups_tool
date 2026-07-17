// Quien puede volver a la cadencia despues de que la sacaron (spec
// 2026-07-17-cadencia-desde-la-llamada). Logica PURA: no conoce la DB, ni Apollo, ni la
// pantalla que la llama. Recibe dos datos y devuelve un si/no.
//
// El porque de que esto exista como archivo propio: 'pausada' colapsa hechos distintos.
// Una inscripcion que se corto porque el ISP respondio y una que Sebastian saco a mano
// terminan en el MISMO estado, y hasta hoy el unico discriminador era motivo_fin, texto
// libre para humanos. Colgar el boton de reversa de un `motivo_fin === 'respuesta
// detectada (whatsapp)'` seria comportamiento dependiendo de prosa: justo lo que la
// constitucion prohibe cuando dice que canal y transcript_proveedor son datos, no codigo.
// Por eso entra origen_fin como valor cerrado, y por eso la regla vive aca y no en el
// repository: es negocio, no acceso a datos.

// Los 5 sitios que hoy terminan una inscripcion, mapeados a su origen:
//   core/tracking.ts:50       respuesta detectada (Apollo)      -> 'respuesta'
//   core/tracking.ts:55       todos salieron (rebote)           -> 'rebote'
//   core/llego-respuesta.ts   respuesta detectada (whatsapp)    -> 'respuesta'
//   sacarInscripcionDeCampana baja manual desde destinatarios   -> 'manual'
//   (nuevo) desde la llamada  baja manual desde la llamada      -> 'manual'
export type OrigenFin = 'respuesta' | 'manual' | 'rebote';

// null = inscripcion viva (no tiene fin), O pausada antes de que la columna existiera.
export type OrigenFinLeido = OrigenFin | null;

export type EstadoInscripcion = 'activa' | 'pausada' | 'bloqueada' | 'finalizada';

// ─────────────────────────────────────────────────────────────────────────────────────
// TODO (Sebastián): la regla es tuya, porque es de negocio, no de codigo.
// ¿Que inscripcion admite volver a la cadencia desde la llamada?
//
// Lo que ya decidiste el 2026-07-17 y no esta en discusion:
//  - 'pausada' + 'manual'    -> SI. Es el caso que pediste: la sacaste tu, te arrepientes.
//  - 'pausada' + 'respuesta' -> NO. Ya hay conversacion viva; devolverla a una cadencia
//                               automatica es el error que el corte existe para evitar.
//  - 'pausada' + 'rebote'    -> NO. El correo no existe, no hay a donde devolverla.
//  - 'pausada' + null        -> NO. Dato viejo: no sabemos por que se pauso, y asumir que
//                               fue manual es asumir a favor del error mas caro.
//  - 'activa'                -> NO. No hay nada que revertir, ya esta corriendo.
//
// Lo que FALTA decidir, y es el trade-off real:
//
//  - 'finalizada': la cadencia corrio hasta el ultimo paso sin que nadie respondiera.
//    Permitirlo te deja re-atacar una cuenta fria despues de una llamada que si abrio
//    puerta ("llamame en marzo") sin armar campana nueva. Prohibirlo mantiene la
//    invariante de que una cadencia terminada es historia cerrada, y te obliga a
//    inscribirla en una campana nueva, que ademas deja rastro de que es un segundo
//    intento. Ojo con el indice unico parcial ux_inscripcion_activa ("una activa por
//    empresa"): reactivar una finalizada mientras otra campana la tiene activa
//    reventaria contra ese indice.
//
//  - 'bloqueada': es otro problema, no una baja. Esta esperando que alguien le elija
//    contacto en "Por revisar" (ver puedeResolverBloqueada en ciclo-vida-campana.ts, que
//    tambien te espera). Ofrecer "volver a meter" aca probablemente confunde dos flujos.
//
// Escribe el cuerpo. Los casos ya decididos estan en reinscripcion.test.ts; los dos de
// arriba tienen su test en todo() esperando tu regla.
// ─────────────────────────────────────────────────────────────────────────────────────
export function puedeVolverAInscribirse(_estado: EstadoInscripcion, _origenFin: OrigenFinLeido): boolean {
  throw new Error('puedeVolverAInscribirse: falta la regla de Sebastián (ver reinscripcion.ts)');
}
