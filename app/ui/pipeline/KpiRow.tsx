// Fila de 5 KPIs principales del pipeline
import { KpiCard } from './KpiCard';

export interface KpiData {
  enSecuencia: number;
  entrandoHoy: number;
  toquesHoy: number;
  onHold: number;
  cerradas: number;
}

export function KpiRow({ data }: { data: KpiData }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5" role="region" aria-label="KPIs del pipeline">
      <KpiCard label="En secuencia" value={data.enSecuencia} tone="primary" />
      <KpiCard label="Entrando hoy (Día 0)" value={data.entrandoHoy} tone="success" />
      <KpiCard label="Toques de hoy" value={data.toquesHoy} tone="warning" />
      <KpiCard label="On Hold" value={data.onHold} tone="neutral" />
      <KpiCard label="Cerradas / Opt Out" value={data.cerradas} tone="error" className="col-span-2 md:col-span-1" />
    </div>
  );
}
