// Dominio puro del estado PBX y su bucle de enriquecimiento. NO importa DB/IA/UI.
import type { Canal } from '../db/validation.ts';

export type FormaPaso =
  | 'llamar_conmutador'
  | 'conseguir_numero'
  | 'enviar_correo'
  | 'esperar'
  | 'hablar_con'
  | 'escalar'
  | 'graduar';

export type ContactoPBX = {
  esKeyDecisionMaker: boolean;
  telefono: string | null;
  email: string | null;
};

// Canales directos alcanzables SOLO via contactos KDM. Distinto de canalesDisponibles
// (canales-empresa.ts), que cuenta cualquier contacto: ese se queda para readiness de
// campañas; este es el eje de PBX.
export function canalesDisponiblesKDM(contactos: ContactoPBX[]): Set<Canal> {
  const dir = new Set<Canal>();
  for (const c of contactos) {
    if (!c.esKeyDecisionMaker) continue;
    if (c.email) dir.add('correo');
    if (c.telefono) {
      dir.add('llamada');
      dir.add('whatsapp');
    }
  }
  return dir;
}

// Alcanzable = telefono, WhatsApp o correo del KDM (decision cerrada del spec,
// seccion "Decisiones cerradas" punto 1). Cualquiera de los tres saca a la
// empresa de PBX; PBX es la ausencia total de un canal directo al KDM.
export function estaEnPBX(contactos: ContactoPBX[]): boolean {
  return canalesDisponiblesKDM(contactos).size === 0;
}

// Resultado ABIERTO de un toque PBX. `clase` es el mapeo a vocabulario (lo pone la IA
// o Sebastian a mano); `nota` es el texto libre; `datoConseguido` marca si se obtuvo
// metodo directo del KDM (dispara graduar).
export type ResultadoPBX = {
  clase: 'pidieron_correo' | 'sin_respuesta' | 'referido_persona' | 'dato_conseguido' | 'otro';
  nota: string;
  personaReferida?: string | null; // "hable con Andrea de compras"
};

export type PasoPropuesto = {
  forma: FormaPaso;
  canal: Canal | null; // llamar->'llamada', correo->'correo', esperar->null
  diasSugeridos: number | null; // offset para proximoFollowUpFecha; null = hoy
  nota: string; // texto que va a proximoPaso, legible en la cola
};

export type EntradaPaso = {
  resultado: ResultadoPBX | null; // null = entrada al bucle (primer paso)
  tieneNumeroConmutador: boolean; // hay contacto de oficina con telefono
  intentos: { llamadas: number; correos: number }; // contados desde `toque`
};

// Ruteo resultado -> forma + canal + diasSugeridos + nota.
//
// Entrada al bucle (resultado null): si hay numero de conmutador, el primer paso es
// llamarlo hoy; si no, primero hay que conseguirlo (via referido u otra fuente).
//
// pidieron_correo: el gatekeeper mando a escribir. La accion es enviar el correo hoy
// mismo (diasSugeridos null); el "esperar ~3 dias" que describe el flujo real pasa en
// el SIGUIENTE toque, cuando el resultado de haber mandado el correo cae en 'otro'.
//
// sin_respuesta: no hubo eco (ni al correo ni al conmutador). Se reintenta llamando
// en ~2 dias; sugerirEscalar es quien avisa si el bucle ya se estanco.
//
// referido_persona: el gatekeeper dio un nombre. Se llama a esa persona hoy.
//
// dato_conseguido: se consiguio el metodo directo del KDM. Graduar es inmediato (hoy);
// el mini-form de contacto KDM lo maneja la UI (Fase 5), no esta funcion.
//
// otro: catch-all para lo imprevisto (p.ej. "envie el correo, ahora toca esperar").
// Default conservador: esperar ~3 dias y volver a intentar.
export function proponerSiguientePaso(e: EntradaPaso): PasoPropuesto {
  const { resultado } = e;

  if (resultado === null) {
    return e.tieneNumeroConmutador
      ? {
          forma: 'llamar_conmutador',
          canal: 'llamada',
          diasSugeridos: null,
          nota: 'Llamar al conmutador',
        }
      : {
          forma: 'conseguir_numero',
          canal: null,
          diasSugeridos: null,
          nota: 'Conseguir el numero del conmutador',
        };
  }

  switch (resultado.clase) {
    case 'pidieron_correo':
      return {
        forma: 'enviar_correo',
        canal: 'correo',
        diasSugeridos: null,
        nota: 'Enviar correo (pedido por el conmutador)',
      };
    case 'sin_respuesta':
      return {
        forma: 'llamar_conmutador',
        canal: 'llamada',
        diasSugeridos: 2,
        nota: 'Reintentar llamada al conmutador',
      };
    case 'referido_persona':
      return {
        forma: 'hablar_con',
        canal: 'llamada',
        diasSugeridos: null,
        nota: resultado.personaReferida
          ? `Hablar con ${resultado.personaReferida}`
          : 'Hablar con la persona referida',
      };
    case 'dato_conseguido':
      return {
        forma: 'graduar',
        canal: null,
        diasSugeridos: null,
        nota: 'Se consiguio el metodo directo del KDM, graduar de PBX',
      };
    case 'otro':
    default:
      return {
        forma: 'esperar',
        canal: null,
        diasSugeridos: 3,
        nota: resultado.nota,
      };
  }
}

// Heuristica de "estancado": tres o mas intentos (llamadas + correos) sin conseguir el
// dato sugieren escalar (referido / otra via). Se sugiere, no se fuerza (CLAUDE.md): la
// UI ofrece el boton, Sebastian decide.
export function sugerirEscalar(intentos: { llamadas: number; correos: number }): boolean {
  return intentos.llamadas + intentos.correos >= 3;
}
