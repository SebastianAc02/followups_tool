import type { Canal } from "../ui/canal-tag.variants.ts";
import type { Severity } from "../ui/severity-text.variants.ts";

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
};

// Cierres y Reagendar no tienen nocion de "vencido": una cuenta en negociacion o atascada
// no se marca overdue solo por no tener proximo_follow_up_fecha. Si tiene fecha, se muestra
// como texto informativo; si no, "sin fecha".
export function filaSinVencimiento(c: FilaCola): FilaAgenda {
  return {
    id: c.id,
    empresa: c.empresa,
    ciudad: c.ciudad,
    contacto: c.contacto,
    cargo: c.cargo,
    canal: canalNormalizado(c.canal),
    estado: c.estado,
    sev: "today",
    severidadTexto: c.fecha ?? "sin fecha",
    actual: false,
  };
}
