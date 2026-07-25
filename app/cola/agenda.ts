import type { Canal } from "../ui/canal-tag.variants.ts";
import type { Severity } from "../ui/severity-text.variants.ts";
import { ESTADOS_CALIENTES } from "../db/funnel";
import type { ResumenTracking } from "../core/resumen-tracking.ts";

export type FiltroCanal = "todos" | Canal;

// empresa.proximoCanal es texto libre en la DB (columna sin enum), asi que puede venir
// null o con un valor legado fuera de Canal. "llamada" es el fallback histórico de
// app/cola/page.tsx (ver ACCION[c.canal ?? "llamada"] pre-dashboard).
export function canalNormalizado(canal: string | null | undefined): Canal {
  return canal === "whatsapp" || canal === "correo" ? canal : "llamada";
}

// Orden de chips fijado por el plan: Todos, Llamadas, Correos, WhatsApp (no el orden de
// CANALES en validation.ts, que es llamada/whatsapp/correo).
export const FILTROS_ORDEN: { filtro: FiltroCanal; label: string }[] = [
  { filtro: "todos", label: "Todos" },
  { filtro: "llamada", label: "Llamadas" },
  { filtro: "correo", label: "Correos" },
  { filtro: "whatsapp", label: "WhatsApp" },
];

export type FilaAgenda = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto: string | null;
  cargo: string | null;
  canal: Canal;
  estado: string | null;
  sev: Severity;
  severidadTexto: string;
  actual: boolean;
  // Bucle PBX (Fase 5): no-null = la fila viene del bucle de enriquecimiento del
  // decisor (app/core/pbx.ts), la UI le pone un badge en vez de tratarla como
  // cadencia comercial normal. Opcional: fixtures/tests que construyen FilaAgenda a
  // mano fuera de filaSinVencimiento/filaConVencimiento no necesitan setearlo.
  pbxForma?: string | null;
  // Aviso de respuesta (V6.1): true = esta empresa tiene una respuesta sin ver.
  respuestaPendiente?: boolean;
  // Badge de la barra "Próximo paso" (2026-07-24). Opcional: las filas armadas a mano en
  // fixtures y tests no lo necesitan, y null es una respuesta valida (no pintar badge).
  badge?: BadgeFecha;
};

export function filtrarPorCanal(filas: FilaAgenda[], filtro: FiltroCanal): FilaAgenda[] {
  if (filtro === "todos") return filas;
  return filas.filter((f) => f.canal === filtro);
}

export function conteosPorCanal(filas: FilaAgenda[]): Record<FiltroCanal, number> {
  return {
    todos: filas.length,
    llamada: filas.filter((f) => f.canal === "llamada").length,
    correo: filas.filter((f) => f.canal === "correo").length,
    whatsapp: filas.filter((f) => f.canal === "whatsapp").length,
  };
}

// Owner cuyo cola.page.tsx usa el split leads/cierres/reagendar (2026-07-14). Solo
// Sebastian: los demas owners siguen viendo colaDelDia sin cambios.
export const OWNER_COLA_SPLIT = "Sebastian Acosta Molina";

// Shape minimo compartido por colaLeads/colaCierres/colaReagendar (repository.ts), lo que
// necesita el mapeo a FilaAgenda.
export type FilaCola = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto: string | null;
  cargo: string | null;
  canal: string | null;
  estado: string | null;
  fecha: string | null;
  // Opcional: colaDelDia (todos los owners) no lo trae; colaLeads/colaCierres/
  // colaReagendar (solo el split de Sebastian) si.
  campana?: string | null;
  pbxForma?: string | null;
  respuestaPendiente?: boolean;
};

// Cierres y Reagendar no tienen nocion de "vencido": una cuenta en negociacion o atascada
// no se marca overdue solo por no tener proximo_follow_up_fecha. Si tiene fecha, se muestra
// como texto informativo; si no, "sin fecha".
export function filaSinVencimiento(c: FilaCola, hoy: string): FilaAgenda {
  // Un cierre nunca se marca vencido (regla de arriba), asi que del badge se descarta la
  // rama overdue: una fecha vieja no pinta badge en vez de gritar VENC. Lo que si cambia es
  // que solo la fecha de HOY se ve como hoy; antes todo cierre entraba en ambar de "today"
  // sin mirar la fecha, y el color mentia igual que el texto.
  const badge = badgeDeFecha(c.fecha, hoy);
  return {
    id: c.id,
    empresa: c.empresa,
    ciudad: c.ciudad,
    contacto: c.contacto,
    cargo: c.cargo,
    canal: canalNormalizado(c.canal),
    estado: c.estado,
    sev: c.fecha === hoy ? "today" : "upcoming",
    severidadTexto: c.fecha ?? "sin fecha",
    actual: false,
    pbxForma: c.pbxForma ?? null,
    respuestaPendiente: c.respuestaPendiente,
    badge: badge?.sev === "overdue" ? null : badge,
  };
}

// Dias de diferencia entre una fecha de follow-up y hoy (ambas ISO yyyy-mm-dd). Positivo =
// vencida, 0 = hoy. Vivia duplicada como funcion local de app/cola/page.tsx; se centraliza
// aca para que Leads y Reagendar (ambos date-driven) compartan el mismo calculo.
export function diasVencido(fechaISO: string, hoyISO: string): number {
  return Math.round((Date.parse(hoyISO) - Date.parse(fechaISO)) / 86400000);
}

// Badge de la barra "Próximo paso": sale de la fecha real de la fila, nunca del bucket al
// que pertenece. filaSinVencimiento fijaba sev "today" para todo cierre, y la barra imprimia
// HOY encima de una fecha del 25 (visto el 2026-07-24, con las 9 filas agendadas para el 25
// y el 27). null = no hay fecha: la barra se calla en vez de inventar urgencia.
//
// El texto va en minuscula a proposito; el uppercase lo pone el CSS de la barra.
export type BadgeFecha = { texto: string; sev: Severity } | null;

export function badgeDeFecha(fecha: string | null, hoy: string): BadgeFecha {
  if (!fecha) return null;
  const dias = diasVencido(fecha, hoy); // positivo = la fecha ya paso
  if (dias > 0) return { texto: "venc.", sev: "overdue" };
  if (dias === 0) return { texto: "hoy", sev: "today" };
  if (dias === -1) return { texto: "mañana", sev: "upcoming" };
  return { texto: `en ${-dias} días`, sev: "upcoming" };
}

// Fila con noción de vencido: usada por Leads y Reagendar (ambas son follow-ups reales con
// fecha). Distinta de filaSinVencimiento (Cierres), que no tiene ese concepto.
export function filaConVencimiento(c: FilaCola, hoy: string, actual: boolean): FilaAgenda {
  const dias = diasVencido(c.fecha!, hoy);
  return {
    id: c.id,
    empresa: c.empresa,
    ciudad: c.ciudad,
    contacto: c.contacto,
    cargo: c.cargo,
    canal: canalNormalizado(c.canal),
    estado: c.estado,
    sev: dias > 0 ? "overdue" : "today",
    severidadTexto: dias > 0 ? `vencido ${dias}d` : "hoy",
    actual,
    pbxForma: c.pbxForma ?? null,
    respuestaPendiente: c.respuestaPendiente,
    badge: badgeDeFecha(c.fecha, hoy),
  };
}

export type Bucket = "lead" | "cierre" | "reagendar";
export type Frescura = "vigente" | "desactualizado" | "sin_fecha";

// 7+ dias vencido deja de sentirse "urgente" y pasa a ser bagaje viejo que hay que
// limpiar, no un toque real de hoy (decision 2026-07-14).
const UMBRAL_DESACTUALIZADO_DIAS = 7;

export function frescuraDe(fecha: string | null, hoy: string): Frescura {
  if (!fecha) return "sin_fecha";
  return diasVencido(fecha, hoy) >= UMBRAL_DESACTUALIZADO_DIAS ? "desactualizado" : "vigente";
}

// A que bucket pertenece una empresa por su estado_notion. Usado para las filas que NO
// vienen ya taggeadas (los pasos de cadencia, que pueden ser de cualquier estado). El
// bucket 'reagendar' NUNCA sale de aqui -- ese lo asigna el caller explicitamente (viene
// de colaReagendar, se deriva del ULTIMO TOQUE, no del estado_notion solo).
export function bucketDeEtapa(estado: string | null): "lead" | "cierre" {
  return estado != null && (ESTADOS_CALIENTES as readonly string[]).includes(estado) ? "cierre" : "lead";
}

// origen distingue un lead/cierre/reagendar "real" (viene directo de colaLeads/
// colaCierres/colaReagendar) de un paso de cadencia que bucketDeEtapa clasifico como
// lead o cierre por su estado_notion -- mismo bucket, pero un paso de cadencia no es un
// lead nuevo. Sin esto la lista "Tus toques" no distinguia por que a veces hay mas filas
// que el contador de Pendientes (que solo cuenta colaLeads). Opcional porque cola/
// cierres/reagendar no lo setean (su ausencia = "directo").
export type FilaColaConBucket = FilaCola & { bucket: Bucket; origen?: "cadencia"; tracking?: ResumenTracking };

export type FilaUnificada = FilaAgenda & {
  bucket: Bucket;
  campana: string | null;
  frescura: Frescura;
  origen?: "cadencia";
  tracking?: ResumenTracking; // pill de "abrió/vio/clic"; ausente = no hubo envío que trackear
};

function filaUnificada(c: FilaColaConBucket, hoy: string, actual: boolean): FilaUnificada {
  const base = c.bucket === "cierre" ? filaSinVencimiento(c, hoy) : filaConVencimiento(c, hoy, actual);
  return { ...base, bucket: c.bucket, campana: c.campana ?? null, frescura: frescuraDe(c.fecha, hoy), origen: c.origen, tracking: c.tracking };
}

// Mezcla las filas de las 4 fuentes (Leads/Cierres/Reagendar/pasos de cadencia, ya
// taggeadas con su bucket por el caller) en una sola lista ordenada: primero lo vigente,
// luego lo sin fecha, al final lo desactualizado -- dentro de cada grupo, la fecha mas
// vieja primero (mas urgente arriba). El primero de la lista resultante es "actual" (el
// que pinta la barra "AHORA").
export function unificarCola(filas: FilaColaConBucket[], hoy: string): FilaUnificada[] {
  const pesoFrescura: Record<Frescura, number> = { vigente: 0, sin_fecha: 1, desactualizado: 2 };
  const ordenadas = [...filas].sort((a, b) => {
    const pa = pesoFrescura[frescuraDe(a.fecha, hoy)];
    const pb = pesoFrescura[frescuraDe(b.fecha, hoy)];
    if (pa !== pb) return pa - pb;
    return (a.fecha ?? "9999-99-99").localeCompare(b.fecha ?? "9999-99-99");
  });
  return ordenadas.map((c, i) => filaUnificada(c, hoy, i === 0));
}

// Las tarjetas de /cola: cuentan sobre las MISMAS filas que se listan abajo, no sobre una
// de las cuatro fuentes. Antes leian `cola.length` (solo colaLeads), asi que las cadencias,
// los cierres y los reagendar nunca entraban al numero aunque salieran listados. Nadie lo
// noto mientras colaLeads traia 15 leads y la tarjeta mostraba algo; al vaciar los leads
// (regla del 2026-07-15: un lead dormido no es un toque) la tarjeta quedo en 0 con un
// WhatsApp listado abajo, y quedo claro que el contador nunca midio su propia etiqueta.
//
// "Pendiente" = tiene fecha y ya llego (vencida o de hoy). Un cierre SIN fecha aparece en la
// lista -- una cuenta en negociacion es trabajo real -- pero no es trabajo de HOY, y esa es
// la pregunta que responde esta tarjeta. Por eso el numero puede ser menor que las filas
// listadas, a proposito.
export function pendientesDeHoy(filas: FilaColaConBucket[], hoy: string): number {
  return filas.filter((f) => f.fecha != null && f.fecha <= hoy).length;
}

// Subconjunto de pendientesDeHoy: solo lo que ya se paso de fecha. Lo de hoy todavia no
// esta vencido.
export function vencidasDeHoy(filas: FilaColaConBucket[], hoy: string): number {
  return filas.filter((f) => f.fecha != null && f.fecha < hoy).length;
}

// La otra mitad de la lista: lo que tiene fecha y todavia no llega (2026-07-24). Existe para
// que el cuadre cierre a la vista -- pendientes + programadas + sin fecha = filas listadas --
// y deje de leerse raro que la tarjeta de hoy diga 0 sobre una lista de 9 filas. Eso es
// exactamente lo que pasa cuando todo lo agendado es de la semana entrante: colaCierres es la
// unica de las cinco consultas sin filtro de fecha, asi que trae futuro y la tarjeta de hoy
// no lo cuenta, con razon. Sin esta tercera tarjeta el numero parecia un error.
export function programadasFuturas(filas: FilaColaConBucket[], hoy: string): number {
  return filas.filter((f) => f.fecha != null && f.fecha > hoy).length;
}

export type FiltrosUnificados = {
  bucket: Bucket | "todos";
  campana: string | "todas";
  canal: FiltroCanal;
  frescura: Frescura | "todas";
};

export function aplicarFiltrosUnificados(filas: FilaUnificada[], f: FiltrosUnificados): FilaUnificada[] {
  return filas.filter(
    (r) =>
      (f.bucket === "todos" || r.bucket === f.bucket) &&
      (f.campana === "todas" || r.campana === f.campana) &&
      (f.canal === "todos" || r.canal === f.canal) &&
      (f.frescura === "todas" || r.frescura === f.frescura),
  );
}
