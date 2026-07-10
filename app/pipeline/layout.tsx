// Shell del Pipeline. Envuelve las sub-vistas (overview/reportes/ajustes, que se
// conmutan por ?tab= dentro de PipelineShell) en el AppShell global. AppShell resuelve
// sesion, sidebar y top bar; la navegacion entre tabs vive en PipelineShell, no aca, asi
// que este layout solo aporta el shell y no agrega otra barra de navegacion.
import type { ReactNode } from 'react';
import { requireSession } from '../lib/session';
import { AppShell } from '../ui/shell/AppShell';

export default async function PipelineLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <AppShell>{children}</AppShell>;
}
