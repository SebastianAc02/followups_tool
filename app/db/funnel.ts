// Dominio del funnel comercial (rediseño home, 2026-07-07).
//
// HUECO DE DOMINIO DEL OWNER: el orden del funnel (early -> late), qué etapas se muestran
// en la barra de pipeline, sus labels y colores, y qué cuenta como "cuenta activa" es una
// decisión comercial de Sebastián. Este default sale de la base real (2026-07-07) pero se
// revisa en el checkpoint de esta tarea. Todo lo demás (queries, UI) consume estas
// constantes; el conocimiento vive en un solo lugar.
//
// Estados reales en la base y su volumen: lead 196, on_hold 126, firma_pago 98,
// contacto_iniciado 64, oportunidad 17, cierre_documentacion 13, reunion_agendada 5,
// enviar_contrato 3, (sin estado) 1437.

export type EtapaFunnel = {
  estado: string; // valor real de empresa.estado_notion
  label: string; // texto legible en la UI
  colorClass: string; // clase Tailwind del segmento (tono morado del claro al oscuro)
};

// Orden del funnel del más frío al más caliente. "on_hold" y "sin estado" quedan FUERA de
// la barra a propósito (on_hold está parqueado; sin estado son 1437 y se comerían la barra).
export const FUNNEL_ETAPAS: EtapaFunnel[] = [
  { estado: 'lead', label: 'Lead', colorClass: 'bg-[#2d2b52]' },
  { estado: 'contacto_iniciado', label: 'Contactado', colorClass: 'bg-[#3b3670]' },
  { estado: 'reunion_agendada', label: 'Reunión', colorClass: 'bg-[#4d4795]' },
  { estado: 'oportunidad', label: 'Oportunidad', colorClass: 'bg-[#635bbf]' },
  // Orden corregido (Sebastian 2026-07-22): cierre/documentacion va ANTES de enviar_contrato.
  // El color es degradado por POSICION (mas claro = mas cerca del cierre), asi que el color
  // se queda con la posicion, no con la etapa.
  { estado: 'cierre_documentacion', label: 'Cierre', colorClass: 'bg-[#7a70e0]' },
  { estado: 'enviar_contrato', label: 'Contrato', colorClass: 'bg-[#8b7cff]' },
  { estado: 'firma_pago', label: 'Firma y pago', colorClass: 'bg-accent-soft' },
];

// "Deals calientes": misma definición que el PIPELINE_CALIENTE que vivía en page.tsx, ahora
// aquí para que resumenHome y la UI no la dupliquen.
export const ESTADOS_CALIENTES = [
  'reunion_agendada',
  'oportunidad',
  'cierre_documentacion',
  'enviar_contrato',
] as const;

// "Cuentas activas": las que están dentro del funnel definido (excluye on_hold y sin estado).
// Default: todas las etapas de FUNNEL_ETAPAS. El owner puede estrecharlo (ej. solo las
// calientes, o incluir on_hold) en el checkpoint.
export const ESTADOS_ACTIVOS: string[] = FUNNEL_ETAPAS.map((e) => e.estado);

// Etapas que NO son banda del embudo: firma_pago es el resultado "ganado",
// on_hold el resultado "parqueado/perdido". Se nombran aqui para que la UI y las
// queries no hardcodeen los strings.
export const ETAPA_GANADA = 'firma_pago';
export const ETAPA_ONHOLD = 'on_hold';

// Bandas del embudo = FUNNEL_ETAPAS sin la etapa ganada (que va como tarjeta de resultado).
export const BANDAS_EMBUDO: EtapaFunnel[] = FUNNEL_ETAPAS.filter((e) => e.estado !== ETAPA_GANADA);

// --- Que estado puede entrar a Toques (regla del operador, 2026-08-03) -------------------
//
// Toques es la pantalla del trabajo del dia, no el inventario del pipeline. La regla la
// dicto Sebastian mirando su cola real, donde las cinco primeras filas eran cuentas en
// on_hold (SILCOM, ITELKOM, Segitel, ITEC SOLUTIONS, REDES Y TELECOMUNICACIONES) con el
// paso de apertura de "Precio ISPs B" vencido hace 6 dias:
//
//   - on_hold: NUNCA entra, por NINGUNA puerta, ni siquiera con un paso de cadencia
//     vencido. "Todavia no van a entrar".
//   - firma_pago: fuera, ya son clientes.
//   - contacto_iniciado: SIEMPRE entra, es lo que mas le interesa ver.
//   - reunion_agendada / oportunidad / cierre_documentacion / enviar_contrato: entran.
//   - lead: solo con inscripcion activa (regla del 2026-07-15, la aplica colaLeads).
//
// El hueco que esta constante cierra es la puerta de las cadencias: agendaHoyCadencias
// levanta pasos de inscripcion sin mirar estado_notion, asi que las on_hold se colaban por
// ahi saltandose la exclusion que colaDelDia si aplicaba. La exclusion se hace en la
// COMPOSICION de la cola (app/cola/hoy.ts), no dentro de agendaHoyCadencias: la campana de
// reactivacion apunta a on_hold a proposito y sus envios y su caja de aprobacion de copys
// siguen corriendo. Lo que cambia es que ese trabajo no se cuenta como toque del dia.
export const ESTADOS_FUERA_DE_TOQUES = ['on_hold', 'firma_pago'] as const;

export function estadoEntraAToques(estado: string | null | undefined): boolean {
  return !(ESTADOS_FUERA_DE_TOQUES as readonly string[]).includes(estado ?? '');
}
