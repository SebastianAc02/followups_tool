// Top bar del shell (server). Buscador es placeholder visual (no funcional en v1). La fecha
// se pasa ya formateada desde AppShell (server) para no meter una isla cliente de reloj.
import type { Perfil } from '../../core/perfil';
import { PerfilMenu } from './PerfilMenu';

export function TopBar({ fecha, perfil }: { fecha: string; perfil: Perfil }) {
  return (
    <div className="relative z-10 flex flex-none items-center gap-4 border-b border-card-hover px-[30px] py-3.5">
      <div className="flex max-w-[420px] flex-1 items-center gap-2.5 rounded-[11px] border border-line-card bg-card px-[13px] py-[9px]">
        <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="#5c606c" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="flex-1 text-[13px] text-faint">Buscar cuentas, campañas, toques…</span>
        <span className="rounded-md border border-line-card bg-surface-2 px-[7px] py-0.5 text-[11px] font-semibold text-muted">
          ⌘K
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">
        <span className="h-[7px] w-[7px] rounded-full bg-done animate-[pulseLive_2s_ease-in-out_infinite]" />
        En vivo
      </div>
      <span className="text-[12.5px] text-faint">{fecha}</span>
      <PerfilMenu perfil={perfil} />
    </div>
  );
}
