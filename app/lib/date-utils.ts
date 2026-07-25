// Zona del negocio. Todo "hoy" del sistema es el dia de calendario en Bogota: la cola, los
// vencidos y las fechas que se guardan. Se fija explicita en vez de depender del huso del
// proceso, para que el mismo codigo no conteste una cosa en el portatil (America/Bogota) y
// otra en el contenedor (UTC).
export const ZONA_BOGOTA = 'America/Bogota';

// Se construye una sola vez: instanciar Intl.DateTimeFormat en cada llamada cuesta, y esto
// corre por fila en las listas.
const FORMATO_FECHA_BOGOTA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_BOGOTA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Dia de calendario en Bogota, "YYYY-MM-DD". Reemplaza a `toISOString().slice(0, 10)`, que
// devuelve UTC por contrato e ignora la variable TZ: por eso entre las 7 pm y la medianoche
// de Colombia el sistema adelantaba el dia. en-CA es el locale que Intl formatea YYYY-MM-DD.
export function fechaBogotaISO(date: Date = new Date()): string {
  return FORMATO_FECHA_BOGOTA.format(date);
}

// Hora del dia en Bogota, 0-23. Misma razon que fechaBogotaISO: el contenedor puede correr
// en UTC (el host del VPS lo hace) y getHours() contestaria la hora del proceso, no la del
// negocio. hourCycle 'h23' y no hour12:false, que en algunas versiones de ICU devuelve "24"
// a medianoche en vez de "00".
const FORMATO_HORA_BOGOTA = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_BOGOTA,
  hour: '2-digit',
  hourCycle: 'h23',
});

export function horaBogota(date: Date = new Date()): number {
  return Number(FORMATO_HORA_BOGOTA.format(date));
}

// Fecha de calendario LOCAL en formato YYYY-MM-DD, sin pasar por UTC. Usar
// `toISOString()` tras `setDate()` convierte a UTC antes de recortar la fecha, lo
// que puede correr el día en +-1 si el huso horario del proceso cruza medianoche
// UTC. Aquí se arma el string directo desde los componentes de fecha locales.
export function fechaLocalISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function plusDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return fechaLocalISO(d);
}

// Parsea "YYYY-MM-DD" a un Date en medianoche LOCAL (no UTC). new Date("2026-07-06")
// interpreta el string como UTC, lo que puede correr el dia -+1 al leer getDay()/getDate()
// segun el huso. Armar el Date desde los componentes lo mantiene en fecha local.
export function parseFechaISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Suma (o resta, si es negativo) dias a una fecha "YYYY-MM-DD" y devuelve otra "YYYY-MM-DD".
// Todo local, sin pasar por UTC.
export function sumarDias(iso: string, dias: number): string {
  const d = parseFechaISO(iso);
  d.setDate(d.getDate() + dias);
  return fechaLocalISO(d);
}

// Dia de la semana de una fecha "YYYY-MM-DD": 0=domingo .. 6=sabado (igual que getDay()).
export function diaSemana(iso: string): number {
  return parseFechaISO(iso).getDay();
}

const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Fecha larga es-CO para el header del dashboard: "Martes 7 de julio". Sin año (la cola
// es de HOY, el año es irrelevante en ese contexto).
export function formatoFechaLargaEsCo(iso: string): string {
  const d = parseFechaISO(iso);
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
}

// Saludo por franja horaria (hora local 0-23). Limites: madrugada y noche caen en
// "Buenas noches" -- no hay franja de "buena madrugada" en el habla es-CO cotidiano.
export function saludoPorHora(hora: number): string {
  if (hora >= 5 && hora < 12) return 'Buenos días';
  if (hora >= 12 && hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// Hora corta es-CO para el header del dashboard: "9:02 a.m.". Formateo manual (no
// Intl) para fijar el patron exacto -- minusculas, puntos, sin cero a la izquierda.
export function formatoHoraEsCo(date: Date): string {
  const minutos = String(date.getMinutes()).padStart(2, '0');
  const ampm = date.getHours() < 12 ? 'a.m.' : 'p.m.';
  const horas12 = date.getHours() % 12 || 12;
  return `${horas12}:${minutos} ${ampm}`;
}
