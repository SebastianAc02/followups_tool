// Segmenta un copy con placeholders [variable] para que la UI decida el resaltado,
// sin JSX en core. Promovido de conVariablesResaltadas (duplicado hoy en
// app/por-revisar/ToqueRevisar.tsx y app/cola/CadenciasHoy.tsx) -- misma regex que
// renderizarCopy (render-copy.ts) para consistencia de deteccion de variables.
export type SegmentoCopy = {
  texto: string;
  esVariable: boolean;
  resuelta: boolean;
};

export function resaltarVariables(texto: string, datos: Record<string, string>): SegmentoCopy[] {
  const partes = texto.split(/(\[[^[\]]+\])/g).filter((p) => p !== '');

  return partes.map((parte) => {
    const match = /^\[([^[\]]+)\]$/.exec(parte);
    if (!match) return { texto: parte, esVariable: false, resuelta: false };

    const nombre = match[1].trim();
    const valor = datos[nombre];
    return valor !== undefined
      ? { texto: valor, esVariable: true, resuelta: true }
      : { texto: parte, esVariable: true, resuelta: false };
  });
}
