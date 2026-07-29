// Cruce entre apertura y clic de un mismo envio (2026-07-29). Pura: sin DB, sin red, sin
// reloj del sistema. Recibe los eventos de UN id_paso_inscripcion ya pasados por
// clasificarEvento (clasificar-evento-tracking.ts) -- este modulo no clasifica nada, solo
// combina veredictos ya emitidos.
//
// Por que existe: hoy pixel_bloqueado_confirmado (estadoMedibilidadEnvio) mete en el mismo
// nombre dos causas distintas -- el pixel nunca se disparo (Outlook, paso 114) y el pixel se
// disparo pero solo lo pidio un proxy (Gmail, paso 115, evento 13 maquina + evento 14 humano).
// Comparten el efecto (cero apertura humana) pero no la causa, y el dia que alguien pregunte
// POR QUE una cuenta no se mide, fundirlas hace inutil el dato. Este modulo separa las dos
// causas y ademas implementa las dos reglas de cruce que ninguna herramienta comercial hace
// (Mixmax, en su propia documentacion, reporta opens y clics aparte y deja la interpretacion
// al usuario):
//
//   R1. Clic humano sin que el pixel se haya disparado nunca => la persona leyo el correo Y
//       ese cliente de correo no es medible por pixel para este envio. Pasa de un cero que
//       parece desinteres a un diagnostico.
//   R2. Apertura de maquina (proxy) + clic humano => esa apertura sube de "no concluyente" a
//       "lectura confirmada". El pixel si se disparo, solo que lo pidio la maquina y no el
//       humano; el clic es quien confirma que el humano si vio el correo.
//
// Nota de diseno sobre orden temporal: R2 no exige que la apertura preceda al clic. Una
// apertura de maquina no es evidencia de nada por si sola (regla base de clasificarEvento), asi
// que el unico dato que aporta valor es la coexistencia de un clic humano en el mismo envio, no
// la secuencia. Exigir orden metería una dependencia de reloj que no cambia la conclusion y
// puede romperse por jitter de red sin que el hecho de fondo (el humano vio el correo) cambie.

import type { Clasificacion } from './clasificar-evento-tracking.ts';

export type EventoParaCruce = {
  tipo: 'abierto' | 'clic' | 'visto';
  clasificacion: Clasificacion;
};

// Causa de por que este envio no tiene apertura humana confirmada por pixel (o si la tiene,
// que la apertura misma fue directa). Es la parte que hoy no existe en el codigo y que hay que
// separar.
export type CausaMedibilidad =
  | 'pixel_nunca_salio' // cero eventos 'abierto', de cualquier clasificacion. Caso Outlook.
  | 'solo_apertura_de_maquina' // hubo 'abierto' y el mas fuerte fue clasificado maquina (proxy). Caso Gmail.
  | 'apertura_sin_huella_capturada' // hubo 'abierto' pero ninguno tiene UA capturado (desconocido). Caso EAFIT pre-28-jul.
  | 'apertura_humana_directa'; // hubo 'abierto' clasificado humano: el cliente si pide el pixel de verdad.

export type Lectura = 'confirmada' | 'no_se_puede_saber';

export type MetodoConfirmacion = 'apertura_humana' | 'apertura_humana_y_clic_humano' | 'clic_humano' | null;

// Los 7 estados que puede emitir el cruce. Los 5 minimos pedidos por el operador estan
// cubiertos asi:
//   - "lectura confirmada por clic humano (con o sin apertura previa)" => cualquiera de los
//     tres 'lectura_confirmada_clic_*'.
//   - "pixel nunca salio + clic humano" => 'lectura_confirmada_clic_pixel_nunca_salio' (R1).
//   - "pixel nunca salio + sin clic" => 'no_se_puede_saber_pixel_nunca_salio'.
//   - "solo apertura de maquina + sin clic" => 'no_se_puede_saber_solo_apertura_maquina'.
//   - "apertura humana directa" => 'lectura_confirmada_apertura_humana'.
// Los dos estados 'apertura_sin_huella_capturada' cubren el caso EAFIT (eventos previos al
// 28-jul, sin UA): ni humano ni maquina, simplemente no hay dato. Nunca se colapsan contra
// 'pixel_nunca_salio' porque la causa es otra (el pixel si se disparo, solo que no quedo
// registrada la huella).
export type EstadoCruce =
  | 'lectura_confirmada_apertura_humana'
  | 'lectura_confirmada_clic_apertura_maquina' // R2
  | 'lectura_confirmada_clic_apertura_sin_huella'
  | 'lectura_confirmada_clic_pixel_nunca_salio' // R1
  | 'no_se_puede_saber_pixel_nunca_salio'
  | 'no_se_puede_saber_solo_apertura_maquina'
  | 'no_se_puede_saber_apertura_sin_huella';

export type VeredictoCruce = {
  estado: EstadoCruce;
  lectura: Lectura;
  metodo_confirmacion: MetodoConfirmacion;
  causa_medibilidad: CausaMedibilidad;
  // Hubo o no, sin importar de quien, al menos un evento 'abierto' para este envio. Es el dato
  // estructural detras de "el pixel nunca salio": false aca es Outlook, true con maquina es
  // Gmail, true con humano es EAFIT-con-huella.
  pixel_se_disparo: boolean;
  // R2: esta apertura paso de "no concluyente" a "lectura confirmada" gracias al clic. Solo
  // puede ser true cuando causa_medibilidad es 'solo_apertura_de_maquina' o
  // 'apertura_sin_huella_capturada' Y ademas hubo clic humano.
  apertura_sube_de_rango: boolean;
  // R1: el pixel nunca se disparo para este envio y aun asi hay lectura confirmada por clic.
  // Es la senal de que este cliente de correo no es medible por pixel, no de que nadie lo leyo.
  cliente_no_medible_por_pixel: boolean;
  // Frase corta, sin porcentajes ni certeza que no existe. Para logs y para que un llamador
  // no tenga que reconstruir el mensaje a mano desde los campos de arriba.
  explicacion: string;
};

function causaPorApertura(hayAperturaHumana: boolean, hayAperturaMaquina: boolean, pixelSeDisparo: boolean): CausaMedibilidad {
  if (hayAperturaHumana) return 'apertura_humana_directa';
  if (hayAperturaMaquina) return 'solo_apertura_de_maquina';
  if (pixelSeDisparo) return 'apertura_sin_huella_capturada';
  return 'pixel_nunca_salio';
}

export function cruzarAperturaClic(eventos: EventoParaCruce[]): VeredictoCruce {
  const aperturas = eventos.filter((e) => e.tipo === 'abierto');
  const clics = eventos.filter((e) => e.tipo === 'clic');

  const pixelSeDisparo = aperturas.length > 0;
  const hayAperturaHumana = aperturas.some((e) => e.clasificacion === 'humano');
  const hayAperturaMaquina = aperturas.some((e) => e.clasificacion === 'maquina');
  const hayClicHumano = clics.some((e) => e.clasificacion === 'humano');

  const causa = causaPorApertura(hayAperturaHumana, hayAperturaMaquina, pixelSeDisparo);

  // Caso 1: apertura humana directa. El cliente de correo si pide el pixel de verdad (caso
  // EAFIT con huella). Gana primero: no hace falta clic para confirmar lectura, y si ademas
  // hubo clic humano, no cambia la conclusion, solo el metodo que se reporta.
  if (hayAperturaHumana) {
    return {
      estado: 'lectura_confirmada_apertura_humana',
      lectura: 'confirmada',
      metodo_confirmacion: hayClicHumano ? 'apertura_humana_y_clic_humano' : 'apertura_humana',
      causa_medibilidad: causa,
      pixel_se_disparo: pixelSeDisparo,
      apertura_sube_de_rango: false,
      cliente_no_medible_por_pixel: false,
      explicacion: 'Apertura humana directa: el cliente de correo si pidio el pixel.',
    };
  }

  // A partir de aca no hubo apertura humana. Lo unico que puede confirmar lectura es un clic
  // humano.
  if (hayClicHumano) {
    // Caso 2 (R2): la apertura que hubo fue de maquina o sin huella -- el clic la sube de
    // rango.
    if (pixelSeDisparo) {
      const estado: EstadoCruce = hayAperturaMaquina
        ? 'lectura_confirmada_clic_apertura_maquina'
        : 'lectura_confirmada_clic_apertura_sin_huella';
      return {
        estado,
        lectura: 'confirmada',
        metodo_confirmacion: 'clic_humano',
        causa_medibilidad: causa,
        pixel_se_disparo: true,
        apertura_sube_de_rango: true,
        cliente_no_medible_por_pixel: false,
        explicacion: hayAperturaMaquina
          ? 'Lectura confirmada por clic humano. La apertura registrada era de una maquina (proxy); el clic la sube de no concluyente a confirmada.'
          : 'Lectura confirmada por clic humano. Hubo apertura pero sin huella capturada; el clic la sube de no concluyente a confirmada.',
      };
    }

    // Caso 3 (R1): el pixel nunca se disparo, cero eventos 'abierto'. El clic es la unica
    // senal, y es suficiente: para clickear un link hubo que ver el correo.
    return {
      estado: 'lectura_confirmada_clic_pixel_nunca_salio',
      lectura: 'confirmada',
      metodo_confirmacion: 'clic_humano',
      causa_medibilidad: 'pixel_nunca_salio',
      pixel_se_disparo: false,
      apertura_sube_de_rango: false,
      cliente_no_medible_por_pixel: true,
      explicacion: 'Lectura confirmada por clic humano. El pixel nunca se disparo: este cliente de correo no es medible por pixel para este envio.',
    };
  }

  // Sin apertura humana y sin clic humano: no hay como confirmar lectura. Jamas se reporta
  // como "no lo abrio", porque no hay dato para afirmar eso.
  if (pixelSeDisparo) {
    const estado: EstadoCruce = hayAperturaMaquina
      ? 'no_se_puede_saber_solo_apertura_maquina'
      : 'no_se_puede_saber_apertura_sin_huella';
    return {
      estado,
      lectura: 'no_se_puede_saber',
      metodo_confirmacion: null,
      causa_medibilidad: causa,
      pixel_se_disparo: true,
      apertura_sube_de_rango: false,
      cliente_no_medible_por_pixel: false,
      explicacion: hayAperturaMaquina
        ? 'No se puede saber. La unica apertura registrada fue de una maquina (proxy) y no hubo clic que la confirme.'
        : 'No se puede saber. Hubo apertura pero sin huella capturada y no hubo clic que la confirme.',
    };
  }

  return {
    estado: 'no_se_puede_saber_pixel_nunca_salio',
    lectura: 'no_se_puede_saber',
    metodo_confirmacion: null,
    causa_medibilidad: 'pixel_nunca_salio',
    pixel_se_disparo: false,
    apertura_sube_de_rango: false,
    cliente_no_medible_por_pixel: true,
    explicacion: 'No se puede saber. El pixel nunca se disparo y no hubo clic. Nunca se reporta como "no lo abrio".',
  };
}
