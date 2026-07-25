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

// Un solo caso admite reversa: la sacaste tu a mano y te arrepentiste. Todo lo demas es NO.
//
// Los cinco casos que decidio Sebastian el 2026-07-17:
//  - 'pausada' + 'manual'    -> SI. Es el caso que la feature existe para servir.
//  - 'pausada' + 'respuesta' -> NO. Ya hay conversacion viva; devolverla a una cadencia
//                               automatica es el error que el corte existe para evitar.
//  - 'pausada' + 'rebote'    -> NO. El correo no existe, no hay a donde devolverla.
//  - 'pausada' + null        -> NO. Dato viejo: no sabemos por que se pauso, y asumir que
//                               fue manual es asumir a favor del error mas caro.
//  - 'activa'                -> NO. No hay nada que revertir, ya esta corriendo.
//
// Los dos que faltaban los cerro Claude el 2026-07-25 por restriccion de tiempo explicita de
// Sebastian, NO porque la decision dejara de ser suya. Ambos quedaron en NO, que es lo
// reversible: abrirlos despues es cambiar un booleano, cerrarlos despues de haber reactivado
// cuentas es limpiar datos. El razonamiento, para poder discutirlo:
//
//  - 'finalizada' -> NO. El argumento que decide no es de criterio sino de esquema: el indice
//    unico parcial ux_inscripcion_activa impone "una activa por empresa", asi que reactivar
//    una finalizada mientras otra campana tiene viva a esa empresa revienta contra el indice.
//    Permitirlo obliga a que cada caller verifique eso antes de escribir, o sea agrega un modo
//    de fallo nuevo a cambio de ahorrarse armar una campana. Y la campana nueva no es puro
//    costo: deja rastro de que es un segundo intento sobre esa cuenta.
//
//  - 'bloqueada' -> NO. No es una baja, es una inscripcion esperando que alguien le elija
//    contacto en "Por revisar" (ver puedeResolverBloqueada en ciclo-vida-campana.ts). Ofrecer
//    "volver a meter" aca mezcla dos flujos: el usuario creeria que la esta reactivando cuando
//    lo que necesita es resolver el bloqueo.
export function puedeVolverAInscribirse(estado: EstadoInscripcion, origenFin: OrigenFinLeido): boolean {
  return estado === 'pausada' && origenFin === 'manual';
}
