// Sidebar del shell (server). Presentacional: recibe los datos ya resueltos (nav items,
// conectores, owner) desde AppShell. La única parte interactiva es <SidebarNav>.
import { SidebarNav, type NavItem } from './SidebarNav';

export type ConectorEstado = {
  nombre: string;
  detalle: string;
  tone: 'done' | 'overdue' | 'today';
};

const DOT_TONE: Record<ConectorEstado['tone'], string> = {
  done: 'bg-done shadow-[0_0_8px_rgba(87,201,138,0.6)]',
  overdue: 'bg-overdue shadow-[0_0_8px_rgba(244,121,107,0.6)]',
  today: 'bg-today shadow-[0_0_8px_rgba(242,183,56,0.6)]',
};

export function Sidebar({
  ownerNombre,
  items,
  conectores,
}: {
  ownerNombre: string;
  items: NavItem[];
  conectores: ConectorEstado[];
}) {
  return (
    <div className="flex w-[250px] flex-none flex-col border-r border-line-shell bg-shell-2 px-3 py-4">
      {/* Workspace switcher */}
      <div className="mb-[18px] flex cursor-pointer items-center gap-2.5 rounded-[11px] px-2.5 py-2 hover:bg-card-hover">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-gradient-to-br from-accent to-[#5d4bd6] text-[14px] font-extrabold text-white shadow-[0_2px_10px_rgba(139,124,255,0.4)]">
          O
        </span>
        <div className="flex-1 leading-[1.15]">
          <div className="text-[13.5px] font-semibold text-ink">OnePay</div>
          <div className="text-[11px] text-faint">{ownerNombre}</div>
        </div>
      </div>

      <div className="mb-2 px-2.5 text-[10.5px] uppercase tracking-[0.16em] text-faint">Módulos</div>

      <SidebarNav items={items} />

      {/* Conectores mini-panel */}
      <div className="mt-auto border-t border-line-shell px-2.5 pb-1 pt-3.5">
        <div className="mb-[11px] text-[10.5px] uppercase tracking-[0.16em] text-faint">Conectores</div>
        {conectores.map((c) => (
          <div key={c.nombre} className="mb-[9px] flex items-center gap-2.5">
            <span className={`h-[7px] w-[7px] rounded-full ${DOT_TONE[c.tone]}`} />
            <span className="flex-1 text-[12.5px] text-ink-soft">{c.nombre}</span>
            <span className="text-[11px] text-faint">{c.detalle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
