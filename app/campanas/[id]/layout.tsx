import type { ReactNode } from 'react';

// Task 10.1 (Fase 10): shell del panel de control por campana. NO envuelve en
// AppShell -- cada sub-ruta (Resumen aqui, /reglas, /destinatarios, /lanzar) ya lo
// hace por su cuenta (mismo patron standalone documentado en esas paginas), asi que
// duplicarlo aca metería un sidebar dentro de otro. Este layout solo es el punto de
// entrada de Next para el segmento [id]; la sub-nav (CampanaSubNav) vive dentro del
// AppShell de cada pagina, no aca, para no forzar un segundo layout wrapper sobre
// paginas que ya resuelven su propio shell.
export default function CampanaLayout({ children }: { children: ReactNode }) {
  return children;
}
