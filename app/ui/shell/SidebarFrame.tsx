// Version liviana de AppShell: solo el sidebar (con su toggle), sin TopBar. Para rutas
// como /llamada, que arman su propio encabezado por vista y no necesitan duplicarlo.
import type { ReactNode } from 'react';
import { datosSidebar } from './AppShell';
import { Sidebar } from './Sidebar';

export async function SidebarFrame({ children }: { children: ReactNode }) {
  const { items, conectores, usuario } = await datosSidebar();

  return (
    <div className="flex h-screen overflow-hidden bg-shell font-body text-ink">
      <Sidebar ownerNombre={usuario.owner} items={items} conectores={conectores} />
      <div className="min-w-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
