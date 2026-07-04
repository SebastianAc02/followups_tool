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
