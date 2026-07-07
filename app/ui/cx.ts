// Une clases y descarta los valores falsy. Reemplaza a clsx sin agregar dependencia.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
