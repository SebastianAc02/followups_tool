// Matriz de comportamiento por cliente de correo, calibrada con datos propios (2026-07-29).
// Modulo PURO: sin DB, sin red, sin reloj propio. Mismo patron que clasificar-evento-tracking.ts
// y dedup-eventos-tracking.ts -- recibe todo ya resuelto por el llamador (eventos ya
// clasificados por clasificarEvento, ya agrupados por deduplicarEventos/agruparDuplicados) y
// solo acumula. No lee evento_tracking, no persiste nada: quien llama decide de donde saca los
// envios y que hace con el resultado.
//
// LA IDEA: hoy lo que sabemos de como se comporta cada cliente de correo (Gmail, Apple Mail,
// Outlook, Thunderbird, escaneres corporativos) sale de blogs y documentacion de terceros,
// medida sobre poblacion gringa. Cada correo propio que sale deja evidencia real de como se
// comporto ese par proveedor+cliente para un ISP colombiano. MATRIZ_SEMILLA guarda lo que dice
// la investigacion externa, con su fuente y su marca de verificado/inferido/conflicto/no medible.
// acumularMatrizClientes(envios) guarda lo que dicen NUESTROS envios. Con el tiempo, la celda
// medida con datos propios debe reemplazar a la inferida -- pero solo cuando cruza el umbral de
// N (ver UMBRAL_N_ENVIOS_CELDA), y si contradice a la semilla se marca la divergencia, nunca se
// pisa en silencio.
//
// LIMITE HONESTO DEL DISEÑO: no existe en la huella de tracking ningun dato que diga "esta
// persona uso la app de Gmail en Android" o "esta persona lee en Apple Mail con MPP". Eso
// requeriria un header (X-Mailer, User-Agent del cliente de correo real) que estos proveedores
// no exponen a proposito (ese es justamente el punto de MPP y del proxy de Gmail). Lo unico
// observable es: a que DOMINIO llego el correo, y que HUELLA de red dejo el pixel/clic. Por eso
// la celda de esta matriz es (dominio del destinatario x superficie de comportamiento
// observada), no "cliente de correo" en sentido literal de software. Es la mejor aproximacion
// empirica posible con la huella que hoy se captura, y tiene un hueco conocido: alguien con
// cuenta @gmail.com puede leer en la app nativa de Apple Mail en su iPhone (MPP incluido) y esta
// matriz no tiene forma de distinguir eso de leer en Gmail web. Cuando eso pasa, la huella que
// se ve es la de Apple (MPP), y el envio cae en la celda (gmail.com, proxy_apple_mpp) en vez de
// en una celda "Gmail leido en cliente Apple" que no existe. Es una limitacion real, no un bug:
// se documenta aca para que nadie lea la matriz como si dominio implicara cliente de software.

// --- Vocabulario compartido con clasificar-evento-tracking.ts, duplicado a proposito (mismo
// criterio que dedup-eventos-tracking.ts: modulo puro, sin import cruzado entre hermanos) ---

export type TipoEvento = 'abierto' | 'clic' | 'visto';
export type ClasificacionEvento = 'humano' | 'maquina' | 'desconocido';

// Vocabulario de Razon en clasificar-evento-tracking.ts al 2026-07-29: trafico_prueba_interno,
// proxy_imagenes_gmail, latencia_bajo_piso_fisico, candidato_proxy_apple_mpp,
// egress_privaterelay_mpp, sin_huella_capturada, ua_navegador_completo, ua_no_clasificable. Se
// tipa como string (no se importa el union) para no acoplar este modulo a la firma exacta del
// clasificador: inferirSuperficie compara por igualdad contra los valores que le importan y
// cualquier razon que no reconozca cae al catch-all, nunca revienta.
export type EventoClasificadoParaMatriz = {
  idEvento: number;
  tipo: TipoEvento;
  fechaEvento: string; // ISO-8601 UTC
  ua?: string | null;
  clasificacion: ClasificacionEvento;
  razon: string;
  excluirDeMetricas: boolean; // veredicto.excluir_de_metricas de clasificarEvento (R1, trafico de prueba)
  grupoDedupId: number; // idEvento representante de su grupo (deduplicarEventos/agruparDuplicados)
  esRepresentanteGrupo: boolean;
};

export type EnvioParaMatriz = {
  idPasoInscripcion: number;
  dominio: string; // dominioDeEmail(email) ya resuelto por el llamador, en minuscula
  fechaEnvio?: string | null;
  // TODOS los eventos del envio, incluidos los que no son representante de su grupo de dedup:
  // hacen falta completos para poder comparar el ua entre duplicados.
  eventos: EventoClasificadoParaMatriz[];
};

// --- Superficie observada: lo unico que la huella de red permite inferir hoy ---

export type SuperficieObservada =
  // Hubo evento 'abierto' (el pixel se disparo) con razon proxy_imagenes_gmail.
  | 'proxy_gmail'
  // Hubo 'abierto' con razon candidato_proxy_apple_mpp (Mozilla/5.0 pelado).
  | 'proxy_apple_mpp'
  // Hubo 'abierto' con razon ua_navegador_completo humano: el pixel se disparo y lo pidio un
  // navegador real, sin proxy conocido en medio.
  | 'pixel_directo_navegador'
  // Hubo 'abierto' pero la razon es sin_huella_capturada o ua_no_clasificable: el pixel se
  // disparo, no se puede leer quien lo pidio.
  | 'pixel_sin_huella'
  // Cero 'abierto' en el envio, y un 'clic' con razon ua_navegador_completo humano: el pixel
  // nunca salio (o no se puede ver que salio) pero el clic es limpio y real.
  | 'clic_directo_navegador'
  // Cero 'abierto', y un 'clic' con razon latencia_bajo_piso_fisico (clasificado maquina):
  // candidato a escaner corporativo por velocidad, no por firma (R9 de la investigacion,
  // confianza MEDIA, umbral sin calibrar con datos propios).
  | 'clic_veloz_sin_pixel'
  // Cero 'abierto', y un 'clic' sin ua legible.
  | 'clic_sin_huella'
  // Ni 'abierto' ni 'clic' con señal usable (por ejemplo solo 'visto', o todo lo que habia era
  // trafico de prueba interno y quedo filtrado).
  | 'sin_evidencia_util';

export type ClaveCelda = {
  dominio: string;
  superficie: SuperficieObservada;
};

// --- Matriz semilla: lo que dice la investigacion externa ---

export type IdClienteInvestigado =
  | 'gmail_web'
  | 'gmail_app_movil'
  | 'apple_mail_mpp'
  | 'apple_mail_sin_mpp'
  | 'outlook_web_y_escritorio'
  | 'outlook_365_safelinks'
  | 'outlook_movil'
  | 'thunderbird'
  | 'escaneres_corporativos';

export type EstadoSemilla = 'verificado' | 'inferido' | 'conflicto' | 'no_se_puede_saber';

export type CeldaSemilla = {
  id: IdClienteInvestigado;
  etiqueta: string;
  descripcion: string;
  fuente: string;
  estado: EstadoSemilla;
  // Huella que esta fila predice ver en evento_tracking, si es que predice alguna que hoy se
  // pueda detectar. null cuando la investigacion no da una huella detectable (ej: no se puede
  // saber que fraccion de usuarios de Apple Mail desactivo MPP).
  superficieTipica: SuperficieObservada | null;
  // Ejemplos ilustrativos de dominio donde esta fila suele aplicar. NO es un filtro exhaustivo:
  // un dominio corporativo puede estar hosteado en Google Workspace o M365 y comportarse como
  // estas filas sin que el dominio literal sea gmail.com u outlook.com (ver cabecera del
  // archivo).
  dominiosEjemplo: string[];
  // false cuando otra fila de esta misma matriz predice la MISMA superficieTipica y hoy no hay
  // forma de separarlas con la huella que se captura (ej: gmail_web y gmail_app_movil son la
  // misma huella de proxy).
  distinguibleDesdeHuella: boolean;
  notas?: string;
};

export const MATRIZ_SEMILLA: CeldaSemilla[] = [
  {
    id: 'gmail_web',
    etiqueta: 'Gmail web (Chrome/Safari/Firefox)',
    descripcion:
      'Carga el pixel via proxy de Google desde 2013, agnostico al navegador porque el proxy corre en el servidor ' +
      'de Google, no en el cliente. El clic sale directo con ip y ua reales del dispositivo.',
    fuente: 'filippo.io (contradice a Litmus sobre si cachea o no) y GMass, verificado contra evento 13 (campana 58, paso 115)',
    estado: 'verificado',
    superficieTipica: 'proxy_gmail',
    dominiosEjemplo: ['gmail.com', 'googlemail.com'],
    distinguibleDesdeHuella: false,
    notas: 'Misma huella que gmail_app_movil: el proxy de imagenes no distingue si el pixel se pidio desde web o desde la app.',
  },
  {
    id: 'gmail_app_movil',
    etiqueta: 'App Gmail (iPhone/Android)',
    descripcion:
      'Mismo proxy que la version web, mas prefetch cuando la sesion esta activa en el dispositivo. El clic sigue ' +
      'siendo directo y real.',
    fuente: 'Everlytic (9.8 mil millones de aperturas medidas, reporta 1-6% de falsos positivos por prefetch), inferido para el resto',
    estado: 'inferido',
    superficieTipica: 'proxy_gmail',
    dominiosEjemplo: ['gmail.com', 'googlemail.com'],
    distinguibleDesdeHuella: false,
    notas:
      'El rango 1-6% es un dato citado de Everlytic sobre su propia base, no una medicion propia: no se reporta como ' +
      'tasa de esta matriz, solo como referencia externa.',
  },
  {
    id: 'apple_mail_mpp',
    etiqueta: 'Apple Mail con Mail Privacy Protection',
    descripcion:
      'Default desde iOS 15 y desde macOS Monterey. Precarga el pixel SIEMPRE en la entrega, no al abrir, via dos ' +
      'relays que separan ip real de contenido y sanean el ua. Clave: MPP no toca los links, solo el contenido remoto, ' +
      'asi que el clic sale limpio con ip y ua reales del dispositivo.',
    fuente: 'documentacion publica de Apple sobre MPP',
    estado: 'verificado',
    superficieTipica: 'proxy_apple_mpp',
    dominiosEjemplo: ['icloud.com', 'me.com', 'mac.com'],
    distinguibleDesdeHuella: true,
    notas:
      'MPP es propiedad del CLIENTE de correo que usa el lector, no del dominio del destinatario: alguien con cuenta ' +
      '@gmail.com que lee en la app de Apple Mail en su iPhone tambien dispara esta huella. Ver limite honesto en la ' +
      'cabecera del archivo.',
  },
  {
    id: 'apple_mail_sin_mpp',
    etiqueta: 'Apple Mail sin MPP',
    descripcion: 'Pixel directo sin proxy, huella real del dispositivo.',
    fuente: 'inferencia por eliminacion a partir de como funciona MPP',
    estado: 'no_se_puede_saber',
    superficieTipica: 'pixel_directo_navegador',
    dominiosEjemplo: ['icloud.com', 'me.com', 'mac.com'],
    distinguibleDesdeHuella: true,
    notas: 'Que fraccion de usuarios desactiva MPP no tiene dato publico. No se reporta un numero para esto, nunca.',
  },
  {
    id: 'outlook_web_y_escritorio',
    etiqueta: 'Outlook web y Outlook escritorio Windows',
    descripcion:
      'Pixel bloqueado por default, el usuario tiene que forzar la descarga de imagenes. Si se fuerza, pasa por un ' +
      'proxy de Microsoft que enmascara la ip. El clic es directo y real, salvo que el correo tenga Safe Links.',
    fuente: 'documentacion de Microsoft, verificado contra evento 15 (campana 58, paso 114: cero aperturas, un clic humano)',
    estado: 'verificado',
    // No hay una superficie tipica detectable hoy: el caso base es "cero aperturas" (no genera
    // fila en evento_tracking, no se ve en esta matriz en absoluto) y el caso forzado pasa por
    // un proxy de Microsoft cuya firma de ua no esta mapeada en clasificarEvento (cae a
    // ua_no_clasificable). No se inventa una superficie que el codigo no puede detectar.
    superficieTipica: null,
    dominiosEjemplo: ['outlook.com', 'hotmail.com', 'live.com'],
    distinguibleDesdeHuella: true,
    notas:
      'El caso base (pixel bloqueado, nunca se fuerza) no deja fila en evento_tracking: ese envio no aparece en ' +
      'acumularMatrizClientes en absoluto, igual que en medibilidadPorEnvio (tools.ts). No es un cero medido, es ' +
      'ausencia de evidencia.',
  },
  {
    id: 'outlook_365_safelinks',
    etiqueta: 'Outlook 365 empresarial con Safe Links / ATP',
    descripcion:
      'Pixel bloqueado igual que el caso consumer, y ademas reescribe todos los links a ' +
      'safelinks.protection.outlook.com, con scan en la entrega y otra vez al momento del clic.',
    fuente: 'Microsoft Learn (verificado). Que el escaner tambien prefetchee imagenes es inferido, sin doc oficial.',
    estado: 'inferido',
    superficieTipica: null,
    dominiosEjemplo: [],
    distinguibleDesdeHuella: true,
    notas:
      'La reescritura a safelinks.protection.outlook.com pasa ANTES de que el link llegue a nuestro servidor: el evento ' +
      '"clic" que capturamos ya viene despues de ese salto, con nuestra propia url de destino. El campo `url` de un ' +
      'clic no permite detectar Safe Links por ese motivo. Ver hueco 2 (verificar carga de landing) para una via ' +
      'indirecta que hoy tampoco esta implementada.',
  },
  {
    id: 'outlook_movil',
    etiqueta: 'App Outlook movil',
    descripcion: 'Carga contenido remoto automatico por default, a diferencia del resto de la familia Outlook.',
    fuente: 'fuentes secundarias, contradice a outlook_web_y_escritorio y quedo sin resolver',
    estado: 'conflicto',
    superficieTipica: null,
    dominiosEjemplo: ['outlook.com', 'hotmail.com', 'live.com'],
    distinguibleDesdeHuella: false,
    notas:
      'Si esto es cierto, un envio a un dominio Outlook con apertura de pixel real (superficie pixel_directo_navegador ' +
      'o similar) podria ser evidencia de app movil en vez de forzado manual -- pero no hay forma de separar esas dos ' +
      'causas con la huella actual, por eso distinguibleDesdeHuella es false.',
  },
  {
    id: 'thunderbird',
    etiqueta: 'Thunderbird',
    descripcion: 'Bloquea contenido remoto por default. Si se habilita, huella real sin proxy, clic directo.',
    fuente: 'Mozilla, documentacion oficial',
    estado: 'verificado',
    superficieTipica: 'pixel_directo_navegador',
    dominiosEjemplo: [],
    distinguibleDesdeHuella: true,
    notas: 'Caso base (bloqueado) tampoco deja fila en evento_tracking, igual que outlook_web_y_escritorio.',
  },
  {
    id: 'escaneres_corporativos',
    etiqueta: 'Escaneres corporativos (Proofpoint URL Defense, Mimecast URL Protect, Barracuda Link Protect)',
    descripcion:
      'Reescriben todos los links y hacen sandboxing en la entrega y otra vez al clic. Ip de datacenter del proveedor. ' +
      'Ninguno publica su user-agent: no hay firma propia para detectarlos, hay que inferirlos por timing y comportamiento.',
    fuente: 'documentacion propia de Proofpoint y Mimecast (verificado que reescriben y hacen sandboxing). Que ' +
      'prefetcheen imagenes es inferido.',
    estado: 'inferido',
    superficieTipica: 'clic_veloz_sin_pixel',
    dominiosEjemplo: [],
    distinguibleDesdeHuella: true,
    notas:
      'clic_veloz_sin_pixel es un candidato por velocidad (R3, confianza media), no una firma propia del escaner: el ' +
      'umbral de latencia no esta calibrado con datos propios, viene de fuentes genericas (Mailgun, Marketo). Un clic ' +
      'humano real pero muy rapido (menos de un segundo) tambien cae aca y se reporta con esa ambiguedad, nunca como ' +
      'escaner confirmado.',
  },
];

// --- Umbral de N: cuando una celda pasa de inferida a medida con datos propios ---
//
// UMBRAL_N_ENVIOS_CELDA = 30. Justificacion:
//
// 1. Es el piso convencional para que la distribucion muestral de una proporcion empiece a
//    aproximarse a normal (regla practica de np>=10 y n(1-p)>=10: en el peor caso, p=0.5, hacen
//    falta al menos 20; 30 es el redondeo hacia arriba mas usado en estadistica introductoria y
//    el que se enseña como piso minimo antes del cual un intervalo de confianza binomial es
//    demasiado ancho para decir algo util).
// 2. Tiene que ser mas alto que el umbral que ya usa este mismo codebase para una afirmacion mas
//    debil: dominiosConAvisoNoMedible (clasificar-evento-tracking.ts) usa 3 casos, pero ese
//    umbral solo dispara un AVISO direccional ("este dominio no se puede medir por pixel"), no
//    reemplaza una fuente citada. Declarar una celda "medida con datos propios" es una
//    afirmacion mas fuerte -- le gana a una fuente externa para todo lector futuro de esta
//    matriz -- y por eso exige mas evidencia que un aviso.
// 3. No exige distintos destinatarios: 30 ENVIOS a la misma celda (mismo dominio, misma
//    superficie) pueden venir del mismo puñado de personas repitiendo comportamiento
//    (pseudo-replicacion). Eso no lo resuelve este umbral, queda anotado como limite abierto: si
//    en el futuro se puede contar destinatarios distintos por celda, ese conteo deberia sumarse
//    como un segundo requisito, no reemplazar a este.
export const UMBRAL_N_ENVIOS_CELDA = 30;

export type OrigenCelda = 'inferida_fuente_externa' | 'medida_datos_propios';

export type DivergenciaSemilla = {
  descripcion: string;
  fuenteContradicha: string;
};

export type EstadisticaCelda = {
  clave: ClaveCelda;
  nEnvios: number;
  idsPasoInscripcion: number[];
  conAperturaPixel: number;
  conClicSinAperturaPrevia: number;
  // Mediana en ms entre fecha_envio y el primer evento valido del envio (cualquier tipo). Se
  // usa mediana y no promedio para no dejar que un solo outlier (por ejemplo un reenvio de red)
  // arrastre el numero. null cuando ningun envio de la celda tiene fecha_envio conocida.
  latenciaMedianaMs: number | null;
  nEnviosConLatencia: number;
  // Duplicados: grupos de dedup con mas de un evento crudo (mismo id_paso_inscripcion, mismo
  // tipo, agrupados por deduplicarEventos/agruparDuplicados). Compara el ua entre los eventos
  // del grupo -- lo que la implementacion de posiblesDuplicados en tools.ts NO hace hoy (hueco 1
  // de la investigacion). Este modulo no toca esa funcion, solo mide correcto para su propio uso.
  duplicadosMismoUa: number;
  duplicadosUaDistinto: number;
  // Grupo duplicado donde no hay suficientes ua no nulos (menos de dos) para decidir si es el
  // mismo dispositivo o dos distintos.
  duplicadosUaIndeterminado: number;
  origen: OrigenCelda;
  // No null solo cuando origen es medida_datos_propios Y el patron observado contradice una
  // expectativa dura de la semilla (ver EXPECTATIVAS_DIVERGENCIA). Con menos evidencia que el
  // umbral, un caso puntual que contradice la semilla se reporta igual (ver
  // detectarDivergenciasGmail) pero la celda como un todo sigue "inferida_fuente_externa": la
  // divergencia no necesita el umbral de N para ser noticia, la promocion a "medida" si.
  divergencia: DivergenciaSemilla | null;
};

// --- Expectativas duras de la semilla, usadas para detectar divergencia ---
//
// Deliberadamente corta: solo entra una expectativa cuando (a) la fuente la marca 'verificado'
// sin ambiguedad de "siempre"/"nunca", y (b) existe una superficie detectable con la huella de
// hoy que la contradeciria sin duda. Gmail cumple las dos: "siempre usa el proxy" (filippo.io,
// GMass, verificado desde 2013) y pixel_directo_navegador (un ua de navegador limpio, sin firma
// de proxy, disparando el pixel) es una contradiccion inequivoca de eso. Outlook NO entra: su
// expectativa es una AUSENCIA ("normalmente no hay pixel"), no una forma positiva que la huella
// actual pueda contrastar sin construir antes un detector del proxy de Microsoft (que no existe
// en clasificarEvento hoy) -- meterlo generaria falsos positivos de divergencia sobre el unico
// caso real que ya esta confirmado (evento 15, paso 114) de que Outlook SI puede tener pixel
// forzado y eso no contradice nada.
const DOMINIOS_GMAIL = ['gmail.com', 'googlemail.com'];

function detectarDivergenciaGmail(clave: ClaveCelda): DivergenciaSemilla | null {
  if (!DOMINIOS_GMAIL.includes(clave.dominio.toLowerCase())) return null;
  if (clave.superficie !== 'pixel_directo_navegador') return null;
  return {
    descripcion:
      `El envio a ${clave.dominio} disparo el pixel con un user-agent de navegador limpio, sin la firma de ` +
      'GoogleImageProxy que la fuente reporta como constante desde 2013.',
    fuenteContradicha: MATRIZ_SEMILLA.find((c) => c.id === 'gmail_web')!.fuente,
  };
}

// --- Acumulacion ---

function eventosValidos(envio: EnvioParaMatriz): EventoClasificadoParaMatriz[] {
  // Solo representantes de su grupo de dedup (una fila real por ocurrencia, no una por cada
  // duplicado tecnico) y nunca trafico de prueba interno (R1, excluir_de_metricas).
  return envio.eventos.filter((e) => e.esRepresentanteGrupo && !e.excluirDeMetricas);
}

function ordenPorFecha(a: EventoClasificadoParaMatriz, b: EventoClasificadoParaMatriz): number {
  return new Date(a.fechaEvento).getTime() - new Date(b.fechaEvento).getTime();
}

// Ladder de precedencia, mismo estilo que clasificarEvento: la señal mas especifica gana. Entre
// varios eventos 'abierto' del mismo envio (deberia ser raro, pero puede pasar si el pixel se
// pide dos veces con ua distinto en cada uno) se toma la razon de mayor precedencia encontrada,
// no la del evento cronologicamente primero.
function inferirSuperficie(validos: EventoClasificadoParaMatriz[]): SuperficieObservada {
  const aperturas = validos.filter((e) => e.tipo === 'abierto');
  if (aperturas.length > 0) {
    if (aperturas.some((e) => e.razon === 'proxy_imagenes_gmail')) return 'proxy_gmail';
    if (aperturas.some((e) => e.razon === 'candidato_proxy_apple_mpp')) return 'proxy_apple_mpp';
    if (aperturas.some((e) => e.razon === 'ua_navegador_completo' && e.clasificacion === 'humano')) {
      return 'pixel_directo_navegador';
    }
    return 'pixel_sin_huella';
  }

  const clics = validos.filter((e) => e.tipo === 'clic');
  if (clics.length > 0) {
    if (clics.some((e) => e.razon === 'ua_navegador_completo' && e.clasificacion === 'humano')) {
      return 'clic_directo_navegador';
    }
    if (clics.some((e) => e.razon === 'latencia_bajo_piso_fisico')) return 'clic_veloz_sin_pixel';
    return 'clic_sin_huella';
  }

  return 'sin_evidencia_util';
}

// "Clic sin apertura previa" es literal en el tiempo, no solo "no hay ningun abierto en el
// envio": si un abierto llega DESPUES del clic (ej. alguien clickea sin cargar imagenes y luego
// si las carga), ese clic igual tuvo cero apertura previa en el momento en que ocurrio. Por eso
// esto se calcula aparte de inferirSuperficie, que solo mira presencia/ausencia sin orden.
function huboClicSinAperturaPrevia(validos: EventoClasificadoParaMatriz[]): boolean {
  const aperturas = validos.filter((e) => e.tipo === 'abierto');
  const clics = validos.filter((e) => e.tipo === 'clic');
  for (const clic of clics) {
    const tClic = new Date(clic.fechaEvento).getTime();
    const huboAperturaAntes = aperturas.some((a) => new Date(a.fechaEvento).getTime() <= tClic);
    if (!huboAperturaAntes) return true;
  }
  return false;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 !== 0 ? ordenado[mitad] : (ordenado[mitad - 1] + ordenado[mitad]) / 2;
}

type ConteoDuplicados = { mismoUa: number; uaDistinto: number; uaIndeterminado: number };

// Agrupa TODOS los eventos del envio (representantes y no) por grupoDedupId y para cada grupo
// con mas de un evento crudo, compara el ua entre ellos. Cierra el hueco 1 de la investigacion
// (posiblesDuplicados en tools.ts nunca compara ua) para el proposito de esta matriz -- no
// modifica esa funcion, que vive en otro archivo.
function contarDuplicados(eventos: EventoClasificadoParaMatriz[]): ConteoDuplicados {
  const porGrupo = new Map<number, EventoClasificadoParaMatriz[]>();
  for (const e of eventos) {
    const lista = porGrupo.get(e.grupoDedupId);
    if (lista) lista.push(e);
    else porGrupo.set(e.grupoDedupId, [e]);
  }

  const conteo: ConteoDuplicados = { mismoUa: 0, uaDistinto: 0, uaIndeterminado: 0 };
  for (const grupo of porGrupo.values()) {
    if (grupo.length < 2) continue; // no es un duplicado, es un evento suelto
    const uas = grupo.map((e) => e.ua).filter((ua): ua is string => !!ua);
    if (uas.length < 2) {
      conteo.uaIndeterminado++;
    } else if (uas.every((ua) => ua === uas[0])) {
      conteo.mismoUa++;
    } else {
      conteo.uaDistinto++;
    }
  }
  return conteo;
}

// Acumula la evidencia de un conjunto de envios por celda (dominio x superficie observada). Pura:
// no lee DB, no infiere clasificacion (eso ya viene resuelto en cada evento por clasificarEvento),
// solo agrupa y cuenta. Un envio cuyos unicos eventos son trafico de prueba interno queda
// completamente afuera (no genera celda 'sin_evidencia_util': eso se reserva para evidencia real
// sin señal usable, no para ruido de verificacion).
export function acumularMatrizClientes(envios: EnvioParaMatriz[]): EstadisticaCelda[] {
  const porCelda = new Map<string, { clave: ClaveCelda; envios: EnvioParaMatriz[] }>();

  for (const envio of envios) {
    const validos = eventosValidos(envio);
    if (validos.length === 0) continue; // solo tenia trafico de prueba interno, o ningun evento

    const superficie = inferirSuperficie(validos);
    const clave: ClaveCelda = { dominio: envio.dominio, superficie };
    const llave = `${clave.dominio}::${clave.superficie}`;
    const entrada = porCelda.get(llave) ?? { clave, envios: [] };
    entrada.envios.push(envio);
    porCelda.set(llave, entrada);
  }

  const resultado: EstadisticaCelda[] = [];
  for (const { clave, envios: enviosCelda } of porCelda.values()) {
    const idsPasoInscripcion = enviosCelda.map((e) => e.idPasoInscripcion);
    let conAperturaPixel = 0;
    let conClicSinAperturaPrevia = 0;
    const latencias: number[] = [];
    const conteoDup: ConteoDuplicados = { mismoUa: 0, uaDistinto: 0, uaIndeterminado: 0 };

    for (const envio of enviosCelda) {
      const validos = eventosValidos(envio);

      if (validos.some((e) => e.tipo === 'abierto')) conAperturaPixel++;
      if (huboClicSinAperturaPrevia(validos)) conClicSinAperturaPrevia++;

      if (envio.fechaEnvio && validos.length > 0) {
        const primerEvento = [...validos].sort(ordenPorFecha)[0];
        const delta = new Date(primerEvento.fechaEvento).getTime() - new Date(envio.fechaEnvio).getTime();
        if (Number.isFinite(delta)) latencias.push(delta);
      }

      const dup = contarDuplicados(envio.eventos);
      conteoDup.mismoUa += dup.mismoUa;
      conteoDup.uaDistinto += dup.uaDistinto;
      conteoDup.uaIndeterminado += dup.uaIndeterminado;
    }

    const origen: OrigenCelda = enviosCelda.length >= UMBRAL_N_ENVIOS_CELDA ? 'medida_datos_propios' : 'inferida_fuente_externa';

    resultado.push({
      clave,
      nEnvios: enviosCelda.length,
      idsPasoInscripcion,
      conAperturaPixel,
      conClicSinAperturaPrevia,
      latenciaMedianaMs: mediana(latencias),
      nEnviosConLatencia: latencias.length,
      duplicadosMismoUa: conteoDup.mismoUa,
      duplicadosUaDistinto: conteoDup.uaDistinto,
      duplicadosUaIndeterminado: conteoDup.uaIndeterminado,
      origen,
      divergencia: detectarDivergenciaGmail(clave),
    });
  }

  return resultado;
}
