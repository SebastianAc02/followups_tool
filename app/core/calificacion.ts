// Dominio del Toque 1: qué de la calificación "imprescindible" ya tengo y qué me toca
// preguntar en la llamada. Lógica pura (sin DB): el server component le pasa los valores
// crudos de la cuenta y recibe la tabla lista para pintar. "recaudo" no es columna de
// empresa todavía (ver Tarea 2, decisión de esquema): entra como imprescindible del guion
// de frío aunque hoy siempre llegue vacío.
export type CampoCalificacion = 'usuarios' | 'crm' | 'pasarela' | 'recaudo';

export const CAMPOS_CALIFICACION: { campo: CampoCalificacion; label: string }[] = [
  { campo: 'usuarios', label: 'Número de usuarios' },
  { campo: 'pasarela', label: 'Pasarela actual' },
  { campo: 'crm', label: 'CRM / Software' },
  { campo: 'recaudo', label: 'Cómo hacen el recaudo' },
];

export type ItemCalificacion = {
  campo: CampoCalificacion;
  label: string;
  estado: 'tengo' | 'preguntar';
  valor: string | null;
};

export type Calificacion = { items: ItemCalificacion[]; tengo: number; total: number };

type Entrada = {
  usuarios: number | null;
  crm: string | null;
  pasarela: string | null;
  recaudo: string | null;
};

function formatear(campo: CampoCalificacion, valor: number | string | null): string | null {
  if (valor === null || valor === '') return null;
  // Coma de miles fija (no es-CO): calca el mockup ("1,240 usuarios") en el Toque 1
  // y en el receipt de Confirmacion -- es una convencion propia de esta UI, no la
  // de es-CO que usa el resto del cockpit (HubHeader, TablaCuentas).
  if (campo === 'usuarios') return Math.round(Number(valor)).toLocaleString('en-US');
  return String(valor);
}

export function calificar(entrada: Entrada): Calificacion {
  const items: ItemCalificacion[] = CAMPOS_CALIFICACION.map(({ campo, label }) => {
    const valor = formatear(campo, entrada[campo]);
    return { campo, label, estado: valor ? 'tengo' : 'preguntar', valor };
  });
  const tengo = items.filter((i) => i.estado === 'tengo').length;
  return { items, tengo, total: CAMPOS_CALIFICACION.length };
}
