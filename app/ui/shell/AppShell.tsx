// Shell reusable del cockpit (rediseño home). Server component: hace su propio fetch de los
// datos del shell y renderiza sidebar + top bar + main. Cualquier ruta lo puede envolver.
import type { ReactNode } from 'react';
import { colaDelDia, listarCampanas, estadoConector, contarPorEstado } from '../../db/repository';
import { ESTADOS_ACTIVOS } from '../../db/funnel';
import { requireSession } from '../../lib/session';
import { Sidebar, type ConectorEstado } from './Sidebar';
import { TopBar } from './TopBar';
import type { NavItem } from './SidebarNav';
import { IconInicio, IconCampanas, IconToques, IconPipeline, IconConectores } from './icons';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(d: Date) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dia = DIAS[d.getDay()];
  const cap = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${cap} ${d.getDate()} ${MESES[d.getMonth()]} · ${hh}:${mm}`;
}

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || 'SV';
}

export async function AppShell({ children }: { children: ReactNode }) {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);

  const toquesHoy = colaDelDia(hoy, owner).length;
  const campanasActivas = listarCampanas().filter((c) => c.estado === 'activa').length;
  const porEstado = contarPorEstado();
  const cuentasFunnel = ESTADOS_ACTIVOS.reduce((s, e) => s + (porEstado[e] ?? 0), 0);

  // Conectores: Granola y Notion tienen fila real; Claude es la API (siempre activa, key
  // server-side). Total conectados / esperados para el badge del nav.
  const granola = estadoConector('granola', usuario.id);
  const notion = estadoConector('notion');
  const conectadosReales = [granola, notion].filter((e) => e.tieneCredencial).length;

  const items: NavItem[] = [
    { href: '/', label: 'Inicio', icon: <IconInicio /> },
    { href: '/campanas', label: 'Campañas', icon: <IconCampanas />, badge: String(campanasActivas) },
    { href: '/cola', label: 'Toques', icon: <IconToques />, badge: String(toquesHoy), badgeTone: toquesHoy > 0 ? 'done' : 'neutral' },
    { href: '/panel', label: 'Pipeline', icon: <IconPipeline />, badge: String(cuentasFunnel) },
    { href: '/conectores', label: 'Conectores', icon: <IconConectores />, badge: `${conectadosReales + 1}/3`, badgeTone: conectadosReales < 2 ? 'overdue' : 'neutral' },
  ];

  const conectores: ConectorEstado[] = [
    { nombre: 'Granola', detalle: granola.tieneCredencial ? 'activo' : 'sin conectar', tone: granola.tieneCredencial ? 'done' : 'overdue' },
    { nombre: 'Claude', detalle: 'activo', tone: 'done' },
    { nombre: 'Notion', detalle: notion.tieneCredencial ? 'activo' : 'sin conectar', tone: notion.tieneCredencial ? 'done' : 'overdue' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-shell font-sans text-ink">
      <Sidebar ownerNombre={owner} items={items} conectores={conectores} />
      <div className="relative flex min-w-0 flex-1 flex-col bg-shell">
        {/* glow ambiental (arbitrary Tailwind, no CSS) */}
        <div className="pointer-events-none absolute -top-[140px] left-[40%] h-[340px] w-[520px] bg-[radial-gradient(closest-side,rgba(139,124,255,0.16),transparent)]" />
        <TopBar fecha={fechaCorta(ahora)} iniciales={iniciales(owner)} />
        <div className="relative z-[1] flex-1 overflow-auto px-[30px] pb-11 pt-[30px]">{children}</div>
      </div>
    </div>
  );
}
