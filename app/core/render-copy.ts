// V1: renderizador de copy con variables personalizadas.
// Sustituye placeholders [nombreVariable] por valores de datos.
// Si una variable no tiene dato, se deja el placeholder y se reporta en faltantes.
// La regex /\[([^[\]]+)\]/ es identica a la de cadencia-parser para consistencia.

export type ResultadoRenderizado = {
  texto: string;
  faltantes: string[];
};

/**
 * Renderiza un texto sustituyendo placeholders [nombreVariable] por valores.
 * Usa la MISMA regex de detección que cadencia-parser para consistencia:
 * /\[([^[\]]+)\]/g detecta [algo] sin corchetes anidados.
 *
 * @param texto - Texto con placeholders [nombreVariable]
 * @param datos - Mapa { nombreVariable: valor } con valores a sustituir
 * @returns { texto (con substituciones), faltantes (variables sin dato, sin duplicados) }
 */
export function renderizarCopy(
  texto: string,
  datos: Record<string, string>
): ResultadoRenderizado {
  const faltantes: string[] = [];
  const vistas = new Set<string>();

  // Sustituye cada placeholder [algo] por el valor de datos[algo] si existe.
  // Si no existe, deja el placeholder y agrega a faltantes.
  const resultado = texto.replace(/\[([^[\]]+)\]/g, (match, nombreVariable) => {
    const nombre = nombreVariable.trim();
    const valor = datos[nombre];

    if (valor !== undefined) {
      return valor;
    } else {
      // Variable sin dato: dejar el placeholder tal cual
      if (!vistas.has(nombre)) {
        vistas.add(nombre);
        faltantes.push(nombre);
      }
      return match; // Devuelve el placeholder original [nombre]
    }
  });

  return { texto: resultado, faltantes };
}
