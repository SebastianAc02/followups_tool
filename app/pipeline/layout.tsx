// Shell del Pipeline: embudo comercial por etapa (estado_notion). AppShell resuelve
// sesion, sidebar y top bar; esta pagina solo aporta el contenido.
import type { ReactNode } from 'react';
import { requireSession } from '../lib/session';
import { AppShell } from '../ui/shell/AppShell';

export default async function PipelineLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <AppShell>{children}</AppShell>;
}
