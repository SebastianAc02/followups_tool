// Core puro (constitucion): del tracking crudo de una empresa arma lo que muestra el pill de
// /cola. No importa DB ni adaptadores; recibe `ahora` inyectado (patron de pollTracking) para
// ser determinista en test.
//
// Caveat de dominio: una apertura por pixel NO prueba que un humano leyo. Gmail carga
// imagenes por proxy y Apple Mail precarga -- se ve "abierto" a los 2 segundos del envio sin
// que nadie lo mire. Por eso el clic y el visto de WhatsApp (ninguno de los dos lo infla un
// proxy) pesan mas que el conteo de aperturas.

export type SeñalTracking = {
  aperturas: number;
  clics: number;
  ultimaApertura: string | null; // ISO
  vioWhatsapp: boolean;
};

export type Temperatura = 'ninguna' | 'frio' | 'tibio' | 'caliente';

export type ResumenTracking = {
  texto: string; // lo que se lee en el pill, p.ej. "Abrió 3× · hace 2h"
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

// Regla de temperatura: clic o visto de WhatsApp son señal fuerte (ningún proxy los
// simula) -> 'caliente' de una. Sin eso, 2+ aperturas es interés real (volvió a mirarlo)
// -> 'tibio'; 1 sola apertura es indistinguible del proxy/precarga -> se trata como 'frio'
// igual que 0 (no hay con qué confiar). Sin ningún evento y sin correo enviado (aperturas
// y clics en 0 sin haber señal previa) -> 'ninguna', no se pinta pill.
export function temperaturaDe(s: SeñalTracking): Temperatura {
  if (s.clics > 0 || s.vioWhatsapp) return 'caliente';
  if (s.aperturas >= 2) return 'tibio';
  return 'frio';
}

export function resumirTracking(s: SeñalTracking, ahora: Date): ResumenTracking {
  const temperatura = temperaturaDe(s);

  const partes: string[] = [];
  if (s.aperturas > 0) partes.push(s.aperturas === 1 ? 'Abrió' : `Abrió ${s.aperturas}×`);
  if (s.clics > 0) partes.push('hizo clic');
  if (s.vioWhatsapp) partes.push('vio WA');
  if (partes.length === 0) partes.push('Sin abrir');

  const cuando = s.ultimaApertura ? ` · ${haceCuanto(s.ultimaApertura, ahora)}` : '';
  const texto = `${partes.join(' · ')}${cuando}`;

  const title =
    s.aperturas === 0 && !s.vioWhatsapp
      ? 'No hay señal de que lo haya visto todavía'
      : `Aperturas: ${s.aperturas} · Clics: ${s.clics}${s.vioWhatsapp ? ' · Vio el WhatsApp' : ''}${
          s.ultimaApertura ? ` · Última: ${haceCuanto(s.ultimaApertura, ahora)}` : ''
        }`;

  return { texto, title, temperatura };
}
