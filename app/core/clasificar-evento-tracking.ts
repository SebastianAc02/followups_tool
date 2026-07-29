// Clasificador de eventos de tracking de correo (2026-07-29). Pura: sin DB, sin red, sin
// reloj del sistema. Recibe cada evento con todo lo que necesita ya resuelto por el llamador
// (join de fecha_envio, chequeo de Apple Private Relay) -- esto es lo que permite testearla
// aislada y reclasificar eventos viejos corriendo la misma funcion sobre filas ya existentes.
//
// Spec de referencia: contravalidacion contra los eventos 6-15 de la campana 58 (prueba del
// operador, 2026-07-29). Ver notas por regla en clasificarEvento.

export type DetalleEvento = {
  via?: string;
  ua?: string | null;
  ip?: string | null;
  url?: string;
  xff?: string;
} | null;

export type EventoParaClasificar = {
  idEvento: number;
  tipo: 'abierto' | 'clic' | 'visto';
  fechaEvento: string; // ISO-8601 UTC
  detalle: DetalleEvento;
  // Fecha del evento 'enviado' del mismo id_paso_inscripcion, resuelta por el llamador (join).
  fechaEnvio?: string | null;
  // Resuelto por el llamador contra el CSV vivo de Apple. No implementado en v1: siempre
  // null hasta que exista ese chequeo (R5 documentada pero inerte).
  ipEnRangoApplePrivateRelay?: boolean | null;
};

export type Clasificacion = 'humano' | 'maquina' | 'desconocido';

export type Razon =
  | 'trafico_prueba_interno'
  | 'proxy_imagenes_gmail'
  | 'latencia_bajo_piso_fisico'
  | 'candidato_proxy_apple_mpp'
  | 'egress_privaterelay_mpp'
  | 'sin_huella_capturada'
  | 'ua_navegador_completo'
  | 'ua_no_clasificable';

export type Confianza = 'alta' | 'media' | 'baja';

export type Veredicto = {
  clasificacion: Clasificacion;
  razon: Razon;
  senal: string;
  confianza: Confianza;
  excluir_de_metricas: boolean;
};

// R1: marca de prueba interna, dato propio, sin ambiguedad. Cubre eventos 11-12.
const FIRMA_TRAFICO_PRUEBA = 'VERIFICACION-AGENTE';

// R2: proxy de imagenes de Gmail. Verificado en dos fuentes independientes (GitHub, GMass) y
// confirmado contra el evento 13 real (campana 58, paso 115): Gmail sirve el pixel desde su
// propio cache y el UA que llega es el del proxy, nunca el del cliente del usuario.
const FIRMAS_PROXY_GMAIL = ['GoogleImageProxy', 'ggpht.com'];

// R3: piso fisico de latencia. Verificado por dos ESP grandes (Mailgun, Marketo): ningun
// humano abre o clickea en menos de un segundo desde que el correo salio.
const PISO_LATENCIA_MS = 1000;

// R4: Mozilla/5.0 pelado, candidato a Apple Mail Privacy Protection. Confianza media a
// proposito: el patron esta reportado, pero un cliente viejo o un escaner mal configurado
// puede mandar el mismo string, asi que no es exclusivo de Apple MPP.
const UA_MOZILLA_PELADO = 'Mozilla/5.0';

// R7: navegador completo. Cubre los casos confirmados en campo: evento 14 (iPhone real,
// Safari) y evento 15 (Mac real, Chrome). Media y no alta porque ningun vendor de escaner
// corporativo (Proofpoint, Mimecast, Barracuda) publica su UA -- uno de esos podria estar
// disfrazado de navegador completo sin que esta regla pueda distinguirlo.
const RE_UA_NAVEGADOR_COMPLETO = /^Mozilla\/5\.0 \(.+\).*(AppleWebKit|Gecko|Chrome|Safari|Firefox|Edg|OPR)/;

function uaVacio(detalle: DetalleEvento): boolean {
  if (detalle === null) return true;
  const ua = detalle.ua;
  return ua === null || ua === undefined || ua === '';
}

export function clasificarEvento(evento: EventoParaClasificar): Veredicto {
  const ua = evento.detalle?.ua ?? null;

  // R1: trafico de prueba interno. excluir_de_metricas es true SOLO para este caso: es el
  // unico que no es trafico real de ningun tipo, ni humano ni maquina genuina.
  if (ua && ua.includes(FIRMA_TRAFICO_PRUEBA)) {
    return {
      clasificacion: 'maquina',
      razon: 'trafico_prueba_interno',
      senal: `ua:${ua}`,
      confianza: 'alta',
      excluir_de_metricas: true,
    };
  }

  // R2: proxy de imagenes de Gmail.
  if (ua) {
    const firmaGmail = FIRMAS_PROXY_GMAIL.find((f) => ua.includes(f));
    if (firmaGmail) {
      return {
        clasificacion: 'maquina',
        razon: 'proxy_imagenes_gmail',
        senal: `ua:${firmaGmail}`,
        confianza: 'alta',
        excluir_de_metricas: false,
      };
    }
  }

  // R3: latencia bajo el piso fisico. Solo aplica a 'abierto' o 'clic', y solo si hay
  // fecha_envio para calcular el delta.
  if ((evento.tipo === 'abierto' || evento.tipo === 'clic') && evento.fechaEnvio) {
    const delta = new Date(evento.fechaEvento).getTime() - new Date(evento.fechaEnvio).getTime();
    if (Number.isFinite(delta) && delta < PISO_LATENCIA_MS) {
      return {
        clasificacion: 'maquina',
        razon: 'latencia_bajo_piso_fisico',
        senal: `latencia_ms:${delta}`,
        confianza: 'alta',
        excluir_de_metricas: false,
      };
    }
  }

  // R4: Mozilla/5.0 pelado, candidato a Apple MPP. Igualdad exacta de cadena completa: nada
  // mas, sin parentesis ni motor.
  if (ua === UA_MOZILLA_PELADO) {
    return {
      clasificacion: 'maquina',
      razon: 'candidato_proxy_apple_mpp',
      senal: `ua:${ua}`,
      confianza: 'media',
      excluir_de_metricas: false,
    };
  }

  // R5: egress en rango de Apple Private Relay. Inerte en v1 -- el campo nunca llega
  // poblado porque el chequeo contra el CSV vivo de Apple no esta construido. El dia que
  // exista el dato, esta regla dispara antes de caer a R7/R8.
  if (evento.ipEnRangoApplePrivateRelay === true) {
    return {
      clasificacion: 'maquina',
      razon: 'egress_privaterelay_mpp',
      senal: `ip:${evento.detalle?.ip ?? 'desconocida'}`,
      confianza: 'alta',
      excluir_de_metricas: false,
    };
  }

  // R6: sin huella capturada. No es inferencia, es la constatacion de que no hay dato.
  // Cubre exacto los eventos 6-10: sin UA porque la captura no existia antes del 2026-07-28.
  if (uaVacio(evento.detalle)) {
    return {
      clasificacion: 'desconocido',
      razon: 'sin_huella_capturada',
      senal: evento.detalle === null ? 'detalle:null' : 'ua:vacio',
      confianza: 'alta',
      excluir_de_metricas: false,
    };
  }

  // R7: UA de navegador completo. Cubre eventos 14 y 15 (iPhone y Mac reales).
  if (ua && RE_UA_NAVEGADOR_COMPLETO.test(ua)) {
    return {
      clasificacion: 'humano',
      razon: 'ua_navegador_completo',
      senal: `ua:${ua}`,
      confianza: 'media',
      excluir_de_metricas: false,
    };
  }

  // R8: catch-all. UA presente, no vacio, no matchea ninguna regla anterior: no es
  // evidencia de nada, es literalmente lo no mapeado.
  return {
    clasificacion: 'desconocido',
    razon: 'ua_no_clasificable',
    senal: `ua:${ua}`,
    confianza: 'baja',
    excluir_de_metricas: false,
  };
}

// --- Deduplicacion ---
//
// Ventana: 2000 ms. El unico duplicado real medido (eventos 8 y 9, misma apertura, mismo
// paso 113) esta separado por 5 ms, tres ordenes de magnitud por debajo. 2s es holgado para
// atrapar ese patron y variantes cercanas (reintento de red, doble render de preview + vista
// completa), y sigue siendo corto: una navegacion de clic no vuelve a dispararse sola por
// doble clic del usuario.
const VENTANA_DEDUP_MS = 2000;

export type EventoParaDedup = {
  idEvento: number;
  idPasoInscripcion: number;
  tipo: 'abierto' | 'clic' | 'visto';
  fechaEvento: string;
  ip?: string | null;
};

export type GrupoDedup = {
  idEvento: number;
  grupoDedupId: number;
  esRepresentanteGrupo: boolean;
};

// Agrupa por (idPasoInscripcion, tipo), en ventana encadenada de 2000ms contra el evento
// anterior del mismo grupo (no solo contra el primero). Desempate por IP: si la ip entrante y
// la ip ya confirmada del GRUPO (la primera no nula vista en la cadena) son no nulas y
// distintas, no se agrupan aunque caigan dentro de la ventana (dos dispositivos distintos, no
// un doble disparo). Se compara contra la ip del grupo y no solo contra el evento anterior
// para que un evento sin IP en el medio no actue de puente entre dos ips reales y distintas.
// Si ninguna de las dos tiene ip, el desempate no aplica y solo pesan tiempo, paso y tipo.
export function deduplicarEventos(eventos: EventoParaDedup[]): GrupoDedup[] {
  const porClave = new Map<string, EventoParaDedup[]>();
  for (const ev of eventos) {
    const clave = `${ev.idPasoInscripcion}::${ev.tipo}`;
    const lista = porClave.get(clave) ?? [];
    lista.push(ev);
    porClave.set(clave, lista);
  }

  const resultado: GrupoDedup[] = [];

  for (const lista of porClave.values()) {
    const ordenada = [...lista].sort(
      (a, b) => new Date(a.fechaEvento).getTime() - new Date(b.fechaEvento).getTime(),
    );

    let representante: EventoParaDedup | null = null;
    let anterior: EventoParaDedup | null = null;
    // Ip confirmada del grupo actual: la primera no nula vista desde que arranco el grupo.
    let ipGrupo: string | null = null;

    for (const ev of ordenada) {
      let mismoGrupo = false;
      if (anterior) {
        const delta = new Date(ev.fechaEvento).getTime() - new Date(anterior.fechaEvento).getTime();
        if (delta <= VENTANA_DEDUP_MS) {
          const ipsDistintas = !!ev.ip && !!ipGrupo && ev.ip !== ipGrupo;
          mismoGrupo = !ipsDistintas;
        }
      }

      if (!mismoGrupo) {
        representante = ev;
        ipGrupo = ev.ip ?? null;
      } else if (!ipGrupo && ev.ip) {
        ipGrupo = ev.ip;
      }

      resultado.push({
        idEvento: ev.idEvento,
        grupoDedupId: representante!.idEvento,
        esRepresentanteGrupo: representante!.idEvento === ev.idEvento,
      });

      anterior = ev;
    }
  }

  return resultado;
}

// --- Aviso de no medible ---
//
// El problema tiene dos caras distintas: Outlook (el pixel nunca sale, cero eventos) y
// Gmail (el pixel sale pero solo lo pide el proxy, nunca el humano). El estado se calcula
// por envio (id_paso_inscripcion).

export type EstadoMedibilidad =
  | 'apertura_humana_confirmada'
  | 'pixel_bloqueado_confirmado'
  | 'sin_senal_humana_de_apertura';

export type EventoClasificadoParaEnvio = {
  tipo: 'abierto' | 'clic' | 'visto';
  clasificacion: Clasificacion;
};

// pixel_bloqueado_confirmado es deductivo, no necesita acumular muestra: un clic sin
// apertura humana previa ya es prueba de que el pixel fallo para ese envio puntual (evento
// 15, paso 114 -- para clickear un link hay que haber visto el correo), no de que el
// destinatario no vio el correo. sin_senal_humana_de_apertura cubre tanto Outlook (nunca
// salio el pixel) como Gmail sin clic (unica apertura fue el proxy, evento 13, paso 115): en
// los dos casos no se puede afirmar nada, nunca se reporta como "no lo abrio".
export function estadoMedibilidadEnvio(eventos: EventoClasificadoParaEnvio[]): EstadoMedibilidad {
  const hayAperturaHumana = eventos.some((e) => e.tipo === 'abierto' && e.clasificacion === 'humano');
  if (hayAperturaHumana) return 'apertura_humana_confirmada';

  const hayClicNoMaquina = eventos.some(
    (e) => e.tipo === 'clic' && (e.clasificacion === 'humano' || e.clasificacion === 'desconocido'),
  );
  if (hayClicNoMaquina) return 'pixel_bloqueado_confirmado';

  return 'sin_senal_humana_de_apertura';
}

// Aviso a nivel proveedor ("Outlook en general no deja medir aperturas"): estadistico,
// necesita mas evidencia que un solo envio. Umbral en CONTEO de casos, no en porcentaje, para
// no chocar con la regla dura de no reportar algo que parezca una tasa medida (no se calcula
// ni se muestra open rate en ningun %, ver seccion 5 de la spec).
const UMBRAL_CASOS_AVISO_PROVEEDOR = 3;

export type EnvioParaAvisoProveedor = {
  dominio: string;
  estado: EstadoMedibilidad;
};

// Devuelve los dominios donde el patron se sostiene: al menos UMBRAL_CASOS_AVISO_PROVEEDOR
// envios con pixel_bloqueado_confirmado y CERO con apertura_humana_confirmada en ese mismo
// dominio. Con un solo caso (outlook.com, envio 114) el umbral no se alcanza: el llamador
// reporta el caso puntual, no una regla general sobre el proveedor.
export function dominiosConAvisoNoMedible(envios: EnvioParaAvisoProveedor[]): string[] {
  const bloqueadosPorDominio = new Map<string, number>();
  const confirmadosPorDominio = new Set<string>();

  for (const envio of envios) {
    if (envio.estado === 'pixel_bloqueado_confirmado') {
      bloqueadosPorDominio.set(envio.dominio, (bloqueadosPorDominio.get(envio.dominio) ?? 0) + 1);
    } else if (envio.estado === 'apertura_humana_confirmada') {
      confirmadosPorDominio.add(envio.dominio);
    }
  }

  const resultado: string[] = [];
  for (const [dominio, casos] of bloqueadosPorDominio) {
    if (casos >= UMBRAL_CASOS_AVISO_PROVEEDOR && !confirmadosPorDominio.has(dominio)) {
      resultado.push(dominio);
    }
  }
  return resultado;
}
