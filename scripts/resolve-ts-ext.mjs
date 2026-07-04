// Loader minimo, solo para tests (node --test): resuelve imports relativos sin
// extension (./index, ./schema) probando .ts primero. No se usa en runtime de la app;
// Next.js/tsc resuelven esto de forma nativa. Sin dependencias nuevas.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !path.extname(specifier)) {
    const baseDir = path.dirname(fileURLToPath(context.parentURL));
    const candidate = path.join(baseDir, `${specifier}.ts`);
    if (existsSync(candidate)) {
      return nextResolve(`${specifier}.ts`, context);
    }
  }
  return nextResolve(specifier, context);
}
