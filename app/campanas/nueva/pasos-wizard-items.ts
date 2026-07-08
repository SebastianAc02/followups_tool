// Helper puro (sin 'use client'): los Server Components (page.tsx) lo llaman
// directo para armar los items de PasosWizard. Si viviera en PasosWizard.tsx (que es
// 'use client'), TODO lo que ese archivo exporta se vuelve una referencia de
// cliente, y un Server Component no puede invocar una funcion de cliente -- mismo
// motivo por el que subNavItemsCampana vive en subnav-items.ts y no en CampanaSubNav.tsx.
export const PASOS_WIZARD = ['Segmento', 'Cadencia', 'Destinatarios', 'Preview', 'Lanzar'] as const;

export type PasoWizardItem = {
  label: (typeof PASOS_WIZARD)[number];
  href?: string;
  onClick?: () => void;
};

// Secuencia completa con rutas reales: se usa en las paginas que un borrador
// visita despues de Cadencia (Destinatarios/Preview/Lanzar) y en /cadencias/[id]
// cuando esa cadencia sigue en borrador -- mismo layout de "lista de pasos" que
// durante la creacion, en vez de saltar a los tabs de CampanaSubNav a mitad de
// camino. El paso activo no lleva href (no tiene sentido linkear a si mismo).
// Segmento SI lleva href real (/campanas/[id]/segmento, ver ese page.tsx): antes no
// tenia ruta fuera de la sesion en vivo de /campanas/nueva, y Sebastian reporto que
// una vez pasaba de Cadencia a Destinatarios ya no podia volver a Segmento nunca mas.
export function pasosWizardCampana(idCampana: number, idCadencia: number, activo: PasoWizardItem['label']): PasoWizardItem[] {
  const base: PasoWizardItem[] = [
    { label: 'Segmento', href: `/campanas/${idCampana}/segmento` },
    { label: 'Cadencia', href: `/cadencias/${idCadencia}` },
    { label: 'Destinatarios', href: `/campanas/${idCampana}/destinatarios` },
    { label: 'Preview', href: `/campanas/${idCampana}/preview` },
    { label: 'Lanzar', href: `/campanas/${idCampana}/lanzar` },
  ];
  return base.map((p) => (p.label === activo ? { label: p.label } : p));
}
