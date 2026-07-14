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
  { estado: 'enviar_contrato', label: 'Contrato', colorClass: 'bg-[#7a70e0]' },
  { estado: 'cierre_documentacion', label: 'Cierre', colorClass: 'bg-[#8b7cff]' },
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
