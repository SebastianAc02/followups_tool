import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Para componentes con variantes CVA: combina clases condicionales y resuelve
// conflictos de utilities (ej. "px-2" + "px-4" -> "px-4"). cx() sigue existiendo
// para los primitivos previos que no necesitan resolver conflictos.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
