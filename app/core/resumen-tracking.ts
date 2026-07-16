// Core puro (constitucion): del tracking crudo de una empresa arma lo que muestra el pill de
// /cola. No importa DB ni adaptadores; recibe `ahora` inyectado (patron de pollTracking) para
// ser determinista en test.
//
// Regla de conteo (estilo MailSuite, decision 2026-07-15): la PRIMERA apertura de un correo
// se descarta siempre -- es indistinguible del proxy de Gmail o la precarga de Apple Mail,
// que disparan el pixel sin que ningun humano haya mirado el correo. A partir de la SEGUNDA
// apertura ya es una persona real volviendo a abrirlo: cuenta de una, sin esperar un segundo
// umbral ("aperturasReales" abajo). Clic y visto de WhatsApp no tienen ese ruido (ningun
// proxy hace clic ni manda un acuse de lectura), asi que cuentan como señal real siempre.

export type SeñalTracking = {
  aperturas: number;
  clics: number;
  ultimaApertura: string | null; // ISO
  vioWhatsapp: boolean;
};

export type Temperatura = 'ninguna' | 'frio' | 'caliente';

export type ResumenTracking = {
  texto: string; // lo que se lee en el pill, p.ej. "Vio 2× · hace 2h"
  title: string; // tooltip
  temperatura: Temperatura; // decide el color del pill; 'ninguna' = no pintar pill
};

export function haceCuanto(iso: string, ahora: Date): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

// La primera apertura no cuenta -- ver comentario de arriba.
function aperturasReales(s: SeñalTracking): number {
  return Math.max(0, s.aperturas - 1);
}

// Regla de temperatura: clic, visto de WhatsApp, o una apertura real (descontando la
// primera) son todas señal confirmada -> 'caliente', sin gradiente intermedio (nada de
// "tibio": o hay evidencia de que un humano lo vio, o no la hay). 0 o 1 apertura sin clic
// ni WhatsApp -> 'frio', indistinguible del proxy.
export function temperaturaDe(s: SeñalTracking): Temperatura {
  if (s.clics > 0 || s.vioWhatsapp || aperturasReales(s) >= 1) return 'caliente';
  return 'frio';
}

export function resumirTracking(s: SeñalTracking, ahora: Date): ResumenTracking {
  const temperatura = temperaturaDe(s);
  const reales = aperturasReales(s);

  const partes: string[] = [];
  if (reales > 0) partes.push(reales === 1 ? 'Vio' : `Vio ${reales}×`);
  if (s.clics > 0) partes.push('hizo clic');
  if (s.vioWhatsapp) partes.push('vio WA');
  if (partes.length === 0) partes.push('Sin abrir');

  // El "hace Xh" solo se ata a una apertura CONFIRMADA (reales > 0). Con aperturas=1 (la
  // descartada) no se muestra hora: mostrarla daria la falsa sensacion de "lo vio hace 2h"
  // cuando esa unica apertura pudo ser el proxy, no una persona.
  const cuando = reales > 0 && s.ultimaApertura ? ` · ${haceCuanto(s.ultimaApertura, ahora)}` : '';
  const texto = `${partes.join(' · ')}${cuando}`;

  const title =
    temperatura === 'frio'
      ? s.aperturas === 1
        ? 'Se registró 1 apertura, pero la primera no cuenta (puede ser el proxy de Gmail/Apple Mail, no una persona)'
        : 'No hay señal de que lo haya visto todavía'
      : `Aperturas reales: ${reales} (de ${s.aperturas} registradas) · Clics: ${s.clics}${s.vioWhatsapp ? ' · Vio el WhatsApp' : ''}${
          s.ultimaApertura ? ` · Última: ${haceCuanto(s.ultimaApertura, ahora)}` : ''
        }`;

  return { texto, title, temperatura };
}
