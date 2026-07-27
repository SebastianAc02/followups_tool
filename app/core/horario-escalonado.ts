// A que hora sale cada mensaje de un lote (2026-07-26). Core puro: recibe la hora de arranque
// y el espaciado, devuelve una fecha por posicion. Sin DB, sin reloj propio, determinista.
//
// Por que existe: el operador revisa siete mensajes de apertura entre 8:00 y 8:30 y los deja
// programados para las 11:00, uno cada dos minutos. Repartir esas siete horas es aritmetica de
// dominio, no algo que deba quedar suelto dentro de una tool del MCP ni de una query.
//
// OJO CON UNA COSA, y es la que sorprende: esta funcion decide desde cuando cada paso es
// ELEGIBLE, no el instante exacto en que sale. Quien manda de verdad es el worker, que corre
// cada 5 minutos y, dentro de una misma pasada, separa los mensajes con su propio espaciado
// (whatsapp_espaciado_min_ms/max_ms). O sea que programar a las 11:00, 11:02 y 11:04 no hace
// que salgan a esas horas exactas: hace que a las 11:05 los tres ya esten habilitados y salgan
// separados por el espaciado configurado. Para que el ritmo real sea de dos minutos, el
// espaciado del worker tiene que valer lo mismo que el de aca. Se documenta en vez de
// disimularse: el que lea "11:02" en la herramienta tiene que saber que es un piso, no una
// promesa.

export type PasoProgramado = { posicion: number; fechaProgramada: string };

// espaciadoMs 0 = todos a la misma hora (el lote entero elegible de una). No se prohibe: es
// exactamente lo que se quiere cuando el ritmo lo pone el worker y no el calendario.
// Forma ISO exigida ANTES de construir el Date, y no solo un chequeo de Invalid Date: el
// parser de V8 acepta prosa. Verificado el 2026-07-26, `new Date('mañana a las 11')` NO devuelve
// Invalid Date, devuelve una fecha real inventada a partir del "11". Confiar en getTime() habria
// dejado siete mensajes programados para un dia cualquiera, y eso solo se descubre cuando no
// salen. Se acepta el dia suelto (todos elegibles desde la medianoche) o el ISO con hora.
const ISO_FECHA_U_HORA = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function calcularHorarioEscalonado(horaInicio: string, cantidad: number, espaciadoMs: number): PasoProgramado[] {
  if (!ISO_FECHA_U_HORA.test(horaInicio)) throw new Error(`hora de inicio invalida: ${horaInicio}`);
  const inicio = new Date(horaInicio);
  if (Number.isNaN(inicio.getTime())) throw new Error(`hora de inicio invalida: ${horaInicio}`);
  if (!Number.isFinite(espaciadoMs) || espaciadoMs < 0) throw new Error(`espaciado invalido: ${espaciadoMs}`);
  if (!Number.isInteger(cantidad) || cantidad < 0) throw new Error(`cantidad invalida: ${cantidad}`);

  const salida: PasoProgramado[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    salida.push({ posicion: i, fechaProgramada: new Date(inicio.getTime() + i * espaciadoMs).toISOString() });
  }
  return salida;
}
