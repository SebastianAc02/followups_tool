import { Stat } from '../ui/Stat';

export type MetricasHubVM = {
  toquesSemana: number;
  tasaRespuesta: number;
  empresasEnSecuencia: number;
  bloqueadasEsperandoRegla: number;
};

export function HubHeader({ metricas }: { metricas: MetricasHubVM }) {
  const tasaPct = Math.round(metricas.tasaRespuesta * 100);

  return (
    <div className="mb-5 flex items-end justify-between">
      <div>
        <h2 className="mb-2 font-serif text-4xl leading-tight tracking-tight text-ink">Campañas</h2>
        <p className="text-sm text-muted">
          {metricas.empresasEnSecuencia} empresas en secuencia hoy · {metricas.bloqueadasEsperandoRegla} bloqueadas
          esperando regla
        </p>
      </div>
      <div className="flex gap-6">
        <Stat value={metricas.toquesSemana.toLocaleString('es-CO')} label="toques esta semana" />
        <Stat value={`${tasaPct}%`} label="tasa de respuesta" tone="done" />
      </div>
    </div>
  );
}
