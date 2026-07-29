// Detector de clic de escaner corporativo (2026-07-29). Pura: sin DB, sin red, sin reloj del
// sistema -- 'ahora' y la fecha de envio entran como parametro porque este proyecto testea con
// reloj fijo.
//
// Problema que resuelve: la regla "un clic prueba lectura humana" (ver estadoMedibilidadEnvio
// en clasificar-evento-tracking.ts, pixel_bloqueado_confirmado) se cae si el clic no lo hizo el
// destinatario sino un escaner de seguridad corporativo. Proofpoint URL Defense, Mimecast URL
// Protect, Barracuda Link Protect y Microsoft Safe Links reescriben TODOS los links salientes y
// los visitan ellos mismos, en la entrega y otra vez cuando el humano hace clic real sobre el
// link reescrito. Ninguno de los cuatro publica su user-agent ni su rango de ip de salida (a
// diferencia del proxy de imagenes de Gmail, que si tiene firma propia -- ver R2 en
// clasificar-evento-tracking.ts): esto es lo que hace que este detector nunca pueda declarar
// certeza, solo inferencia con confianza declarada.
//
// SE HONESTO CON LA CONFIANZA (instruccion del operador, 2026-07-29): este detector NUNCA
// devuelve 'humano' ni 'maquina' como los hace clasificarEvento. Devuelve 'probable_escaner' o
// 'sin_evidencia_de_escaner'. La segunda NO es "es humano": es la ausencia de las senales que
// se saben buscar, con las senales que no se saben buscar (ip de datacenter) declaradas afuera.

export type DetalleClicParaDetector = {
  url?: string | null;
  ua?: string | null;
} | null;

export type ClicParaDetectarEscaner = {
  fechaEvento: string; // ISO-8601 UTC, fecha del evento 'clic'
  fechaEnvio?: string | null; // fecha del evento 'enviado' del mismo id_paso_inscripcion
  detalle: DetalleClicParaDetector;
};

export type SenalEscaner =
  | 'latencia_bajo_piso_escaner'
  | 'url_reescrita_por_escaner'
  | 'ua_vacio_en_clic';

export type Confianza = 'alta' | 'media' | 'baja';

export type VeredictoEscaner = {
  clasificacion: 'probable_escaner' | 'sin_evidencia_de_escaner';
  // Cada senal que disparo, en el orden en que se evaluaron. Vacio si no disparo ninguna.
  senales: SenalEscaner[];
  confianza: Confianza;
  detalle: string;
};

// --- Senal 1: latencia desde el envio ---
//
// La MAS FUERTE de las tres implementadas porque es la unica con un mecanismo causal directo y
// verificable en campo: Proofpoint y Mimecast documentan que el sandboxing de un link ocurre en
// la ENTREGA del correo (doc propia de cada vendor, ver contexto de la tarea), no cuando el
// humano decide clickear. Un escaner que ya escaneo en la entrega puede volver a tocar el link
// al momento del clic real, pero el primer hit -- el que casi siempre se captura como 'clic' si
// el receptor de tracking no distingue fases -- cae segundos despues del envio, no minutos u
// horas.
//
// Umbral PROVISIONAL, NO calibrado con datos propios: 30000ms (30s). Sale de una fuente
// generica (no un dato propio de OnePay ni de ISPs colombianos, la investigacion previa lo dice
// explicito): el piso fisico de latencia humana que ya usa clasificarEvento (R3, 1000ms,
// Mailgun/Marketo) mide el minimo fisico para que un humano ABRA un correo. Este umbral mide
// otra cosa: cuanto tarda un escaner corporativo en terminar su pipeline de entrega (recepcion,
// filtrado de spam, reescritura de links, sandboxing) y empezar a tocar los links reescritos.
// 30s es 30x el piso de R3, elegido por ser un orden de magnitud mayor que cualquier latencia de
// red humana normal (segundos) y claramente menor que el tiempo tipico que tarda un humano en
// abrir un correo y decidir clickear (minutos u horas, salvo el caso confirmado de "estaba
// mirando el correo cuando llego", ver test de ese caso). Si aparece data propia de latencia de
// escaner medida en campo, este umbral se reemplaza, no se ajusta a ojo.
const PISO_LATENCIA_ESCANER_MS = 30000;

// --- Senal 2: url reescrita por un escaner conocido ---
//
// Confirmado leyendo el codigo (instruccion de la tarea: "investiga en el codigo si esa url
// queda registrada"): DetalleEvento.url y DetalleClicParaDetector.url son el mismo campo que ya
// popula detalle.url en clasificar-evento-tracking.ts (ver eventos 14 y 15, paso 115/114,
// campana 58) -- la url del clic SI queda registrada en el detalle del evento. Esta senal
// depende de que esa url llegue con el dominio del escaner que la reescribio, no con el link
// original de OnePay.
//
// Firmas verificadas contra documentacion propia de cada vendor (Microsoft Learn, doc de
// Proofpoint, doc de Mimecast; ver contexto de la tarea). Barracuda Link Protect no tiene un
// dominio de reescritura publico documentado en esta investigacion, por eso no entra en la
// lista: mejor una lista corta y verificada que una larga con relleno adivinado.
const DOMINIOS_REESCRITURA_ESCANER = [
  'safelinks.protection.outlook.com', // Microsoft Safe Links / ATP
  'urldefense.com', // Proofpoint URL Defense (dominio corto, formato actual)
  'urldefense.proofpoint.com', // Proofpoint URL Defense (formato legado)
  'protect-us.mimecast.com', // Mimecast URL Protect (region US, la mas comun)
  'protect2.mimecast.com', // Mimecast URL Protect (variante numerada, vista en el mismo doc)
];

function urlReescritaPorEscaner(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Url no parseable: no es evidencia de escaner, es dato roto. No dispara la senal.
    return null;
  }
  return DOMINIOS_REESCRITURA_ESCANER.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
}

// --- Senal 3: user-agent vacio en el clic ---
//
// La MAS DEBIL de las tres: un ua vacio en un clic tiene mas de una causa posible (cliente de
// correo raro, extension de privacidad del navegador, un proxy corporativo que si prefetchea
// pero no manda ua -- inferido, sin doc oficial que lo confirme, ver contexto de la tarea). No
// es firma de escaner, es ausencia total de dato, igual que R6 sin_huella_capturada en
// clasificar-evento-tracking.ts. Se incluye como senal de apoyo, nunca sola: por si misma no
// alcanza para 'probable_escaner' (ver combinarSenales).
function uaVacioEnClic(detalle: DetalleClicParaDetector): boolean {
  if (detalle === null) return true;
  const ua = detalle.ua;
  return ua === null || ua === undefined || ua === '';
}

// --- Senal declarada NO implementada: ip de datacenter vs residencial ---
//
// Instruccion explicita de la tarea: si no se puede determinar sin una base externa de rangos
// de ip por proveedor de datacenter (AWS, Azure, GCP, y los rangos propios de cada vendor de
// escaner), se declara no implementada en vez de inventar una heuristica fragil. Esta funcion
// existe para que el llamador pueda mostrar el hueco en vez de que quede implicito.
export function senalIpDatacenterNoImplementada(): { implementada: false; motivo: string } {
  return {
    implementada: false,
    motivo:
      'Requiere una base externa de rangos de ip por datacenter/proveedor de escaner. ' +
      'Proofpoint, Mimecast y Barracuda conocen sus propias ip de salida; este sistema las ' +
      'infiere igual que cualquier herramienta comercial, sin ventaja. No implementada en v1.',
  };
}

// Combina las senales disparadas en una clasificacion final. La logica de peso:
//
// - Latencia bajo el piso (la mas fuerte, mecanismo causal directo) sola ya alcanza para
//   'probable_escaner' con confianza MEDIA. No alta: el umbral es provisional y generico (no
//   calibrado con datos propios), asi que un caso real de "humano rapido" (ver test de ese
//   caso) puede caer del lado equivocado. La investigacion previa es explicita: aca no le
//   ganamos a nadie, ningun escaner publica su comportamiento para calibrar contra el.
// - Url reescrita (evidencia de que el escaner tuvo el link en las manos en algun punto de la
//   cadena, pero NO prueba que fue el escaner y no el humano quien genero ESTE clic puntual:
//   una vez reescrito, tanto el escaner como el humano visitan el mismo link reescrito) sola
//   alcanza para 'probable_escaner' con confianza MEDIA por el mismo motivo.
// - Ua vacio NUNCA dispara solo. Es la senal mas debil (multiples causas posibles, ninguna
//   especifica de escaner) y solo suma confianza cuando ya hay otra senal mas fuerte.
// - Latencia + url reescrita juntas (dos senales independientes con mecanismos causales
//   distintos apuntando al mismo veredicto) suben a confianza ALTA: es el caso mas cercano a
//   evidencia solida que este detector puede producir sin firma directa de vendor.
function combinarSenales(disparadas: SenalEscaner[]): { clasificacion: VeredictoEscaner['clasificacion']; confianza: Confianza } {
  const tieneLatencia = disparadas.includes('latencia_bajo_piso_escaner');
  const tieneUrl = disparadas.includes('url_reescrita_por_escaner');

  if (tieneLatencia && tieneUrl) {
    return { clasificacion: 'probable_escaner', confianza: 'alta' };
  }
  if (tieneLatencia || tieneUrl) {
    return { clasificacion: 'probable_escaner', confianza: 'media' };
  }
  // Solo ua_vacio disparado, o ninguna senal: no hay evidencia de escaner. Un ua vacio solo no
  // es prueba de nada por si mismo (ver comentario de la senal), asi que no sube a
  // 'probable_escaner' aunque haya disparado.
  return { clasificacion: 'sin_evidencia_de_escaner', confianza: 'baja' };
}

export function detectarClicEscaner(clic: ClicParaDetectarEscaner): VeredictoEscaner {
  const senales: SenalEscaner[] = [];
  const detalles: string[] = [];

  // Senal 1: latencia bajo el piso de escaner.
  if (clic.fechaEnvio) {
    const delta = new Date(clic.fechaEvento).getTime() - new Date(clic.fechaEnvio).getTime();
    if (Number.isFinite(delta) && delta >= 0 && delta < PISO_LATENCIA_ESCANER_MS) {
      senales.push('latencia_bajo_piso_escaner');
      detalles.push(`latencia_ms:${delta}`);
    }
  }

  // Senal 2: url reescrita por un dominio de escaner conocido.
  const url = clic.detalle?.url ?? null;
  if (url) {
    const dominioMatch = urlReescritaPorEscaner(url);
    if (dominioMatch) {
      senales.push('url_reescrita_por_escaner');
      detalles.push(`url_reescrita:${dominioMatch}`);
    }
  }

  // Senal 3: ua vacio en el clic. Nunca decide sola (ver combinarSenales), pero se registra
  // igual para que el detalle del veredicto muestre por que penso lo que penso.
  if (uaVacioEnClic(clic.detalle)) {
    senales.push('ua_vacio_en_clic');
    detalles.push('ua:vacio');
  }

  const { clasificacion, confianza } = combinarSenales(senales);

  return {
    clasificacion,
    senales,
    confianza,
    detalle: detalles.length > 0 ? detalles.join(';') : 'sin_senales_disparadas',
  };
}
