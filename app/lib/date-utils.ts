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
