// El core define QUE necesita de un proveedor de IA, no COMO se procesa.
// ClaudeAdapter es la primera implementacion (app/adapters/claude.ts); el dia
// que se quiera cambiar de modelo o proveedor, implementa esta MISMA interfaz
// y el core no cambia.
//
// El core entrega el resumen cacheado de una sesion (ya traido por el
// TranscriptAdapter) y recibe cuatro borradores listos para revision humana.
// La IA NUNCA llega a Notion sin que el owner apruebe cada borrador (outbox).
export type BorradorToque = {
  // Solo facts observables: quien estuvo, que se mostro, que preguntaron.
  // Sin interpretacion ni juicios de valor.
  notasDiscovery: string;

  // Narracion de lo que paso en voz-onepay: directo, sin em-dashes, sin emojis.
  quePaso: string;

  // Contexto de la cuenta en dos o tres lineas: sector, tamano, dolor principal.
  brief: string;

  // Propuesta concreta de proximo paso con fecha tentativa si aplica.
  proximoPaso: string;
};

export interface IAPort {
  // Recibe el resumen cacheado de la sesion (texto libre de Granola) y devuelve
  // cuatro borradores. Siempre borradores: el llamador los manda al outbox solo
  // tras aprobacion humana explicita.
  extraerBorradores(resumenCacheado: string): Promise<BorradorToque>;
}
