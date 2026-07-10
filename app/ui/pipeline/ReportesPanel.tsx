// Pantalla de Reportes: 4 tarjetas de métricas principales
import { cn } from '../cn';

export interface ReporteMockData {
  cuentasPorSecuencia: {
    secuencia: string;
    total: number;
    porcentaje: number;
  }[];
  mezclaCanales: {
    canal: string;
    total: number;
    porcentaje: number;
  }[];
  tasaHold: {
    actual: number;
    promedio7d: number;
  };
  finalizadasVsOptOut: {
    finalizadas: number;
    optOut: number;
  };
}

function TarjetaMetrica({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-pipeline-card border border-line-card rounded-xl p-6', className)}>
      <h3 className="text-sm font-semibold uppercase tracking-widest text-muted mb-4">{titulo}</h3>
      {children}
    </div>
  );
}

export function ReportesPanel({ data }: { data: ReporteMockData }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">Reportes</h2>
        <p className="mt-1 text-sm text-muted">Métricas y análisis del pipeline.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cuentas por secuencia */}
        <TarjetaMetrica titulo="Cuentas por secuencia">
          <div className="space-y-2">
            {data.cuentasPorSecuencia.map((item) => (
              <div key={item.secuencia} className="flex items-center justify-between">
                <span className="text-xs text-ink-soft">{item.secuencia}</span>
                <div className="flex items-center gap-2 flex-1 mx-3">
                  <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${item.porcentaje}%` }} />
                  </div>
                  <span className="text-xs text-muted w-10 text-right tabular-nums">{item.total}</span>
                </div>
              </div>
            ))}
          </div>
        </TarjetaMetrica>

        {/* Mezcla de canales */}
        <TarjetaMetrica titulo="Mezcla de canales">
          <div className="space-y-2">
            {data.mezclaCanales.map((item) => (
              <div key={item.canal} className="flex items-center justify-between">
                <span className="text-xs text-ink-soft">{item.canal}</span>
                <div className="flex items-center gap-2 flex-1 mx-3">
                  <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${item.porcentaje}%` }} />
                  </div>
                  <span className="text-xs text-muted w-10 text-right tabular-nums">{item.total}</span>
                </div>
              </div>
            ))}
          </div>
        </TarjetaMetrica>

        {/* Tasa de Hold */}
        <TarjetaMetrica titulo="Tasa de Hold">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-3xl font-serif font-semibold text-ink mb-1">{data.tasaHold.actual}%</div>
              <div className="text-xs text-muted">Actual</div>
            </div>
            <div className="pt-3 border-t border-line-card">
              <div className="text-sm text-ink-soft">Promedio últimos 7 días</div>
              <div className="text-2xl font-serif font-semibold text-accent mt-1">{data.tasaHold.promedio7d}%</div>
            </div>
          </div>
        </TarjetaMetrica>

        {/* Finalizadas vs Opt Out */}
        <TarjetaMetrica titulo="Finalizadas vs Opt Out">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="text-2xl font-serif font-semibold text-green mb-1">{data.finalizadasVsOptOut.finalizadas}</div>
              <div className="text-xs text-muted">Finalizadas</div>
            </div>
            <div className="flex-1">
              <div className="text-2xl font-serif font-semibold text-red mb-1">{data.finalizadasVsOptOut.optOut}</div>
              <div className="text-xs text-muted">Opt Out</div>
            </div>
          </div>
        </TarjetaMetrica>
      </div>
    </div>
  );
}
