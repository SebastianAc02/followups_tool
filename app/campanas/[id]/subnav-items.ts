// Helper puro (sin 'use client'): los Server Components (page.tsx) lo llaman
// directo para armar los items del subnav. Si viviera en CampanaSubNav.tsx (que es
// 'use client'), TODO lo que ese archivo exporta se vuelve una referencia de
// cliente, y un Server Component no puede invocar una funcion de cliente -- solo
// puede renderizarla como <Componente /> o pasarla como prop. Por eso separado.
export type SubNavItem = {
  href: string;
  label: string;
};

// Mismo set de tabs en las 6 pantallas de una campana (Resumen, Cadencia, Reglas,
// Destinatarios, Preview, Lanzar) para que el header no se pierda al navegar entre
// ellas. Orden real del flujo de creacion: Segmento -> Cadencia -> Destinatarios ->
// Preview -> Lanzar (Preview es el penultimo paso, revision final antes de lanzar).
export function subNavItemsCampana(idCampana: number, idCadencia: number): SubNavItem[] {
  return [
    { href: `/campanas/${idCampana}`, label: 'Resumen' },
    { href: `/cadencias/${idCadencia}`, label: 'Cadencia' },
    { href: `/campanas/${idCampana}/reglas`, label: 'Reglas' },
    { href: `/campanas/${idCampana}/destinatarios`, label: 'Destinatarios' },
    { href: `/campanas/${idCampana}/preview`, label: 'Preview' },
    { href: `/campanas/${idCampana}/lanzar`, label: 'Lanzar' },
  ];
}
