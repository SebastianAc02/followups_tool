// Pantalla de Ajustes: toggles y configuraciones del pipeline
'use client';

import { useState } from 'react';
import { cn } from '../cn';

export interface AjustesMockData {
  pausaFestivos: boolean;
  pausaFinDeSemana: boolean;
  pausaRespuestaNegativa: boolean;
  persistenciaFiltros: boolean;
  notificacionesToques: boolean;
}

function ToggleSwitch({
  id,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-line-card last:border-b-0">
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink cursor-pointer">
          {label}
        </label>
        {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        )}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}

export function AjustesPanel({ initialData }: { initialData: AjustesMockData }) {
  const [data, setData] = useState(initialData);

  const handleToggle = (key: keyof AjustesMockData, value: boolean) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">Ajustes</h2>
        <p className="mt-1 text-sm text-muted">Configuración de comportamiento del pipeline.</p>
      </div>

      {/* Pausas automáticas */}
      <div className="bg-pipeline-card border border-line-card rounded-xl p-6">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted mb-4">Pausas automáticas</h3>
        <div className="space-y-0">
          <ToggleSwitch
            id="pausa-festivos"
            label="Pausar en festivos"
            description="No programar toques en días festivos nacionales."
            checked={data.pausaFestivos}
            onChange={(value) => handleToggle('pausaFestivos', value)}
          />
          <ToggleSwitch
            id="pausa-fin-semana"
            label="Pausar fin de semana"
            description="No programar toques después del viernes."
            checked={data.pausaFinDeSemana}
            onChange={(value) => handleToggle('pausaFinDeSemana', value)}
          />
          <ToggleSwitch
            id="pausa-respuesta-negativa"
            label="Pausar por respuesta negativa"
            description="Detener la cadencia si el cliente dice que no."
            checked={data.pausaRespuestaNegativa}
            onChange={(value) => handleToggle('pausaRespuestaNegativa', value)}
          />
        </div>
      </div>

      {/* Interfaz */}
      <div className="bg-pipeline-card border border-line-card rounded-xl p-6">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted mb-4">Interfaz</h3>
        <div className="space-y-0">
          <ToggleSwitch
            id="persistencia-filtros"
            label="Recordar filtros activos"
            description="Mantener los filtros seleccionados entre sesiones."
            checked={data.persistenciaFiltros}
            onChange={(value) => handleToggle('persistenciaFiltros', value)}
          />
          <ToggleSwitch
            id="notificaciones-toques"
            label="Notificaciones de toques"
            description="Alertar cuando hay nuevos toques disponibles."
            checked={data.notificacionesToques}
            onChange={(value) => handleToggle('notificacionesToques', value)}
          />
        </div>
      </div>
    </div>
  );
}
