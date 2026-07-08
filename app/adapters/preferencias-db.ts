import type { LeerPreferencias, GuardarPreferencias } from '../core/ports/preferencias';
import { PREFERENCIAS_DEFAULT, type Preferencias, type PreferenciasParciales } from '../core/perfil';
import { leerPreferencia, guardarPreferencia } from '../db/preferencias-repository';
import { db as dbSingleton } from '../db/index';

type DbInstancia = typeof dbSingleton;

// Adapter Fase 2: reemplaza a PreferenciasDefaultAdapter (app/adapters/preferencias-defaults.ts)
// ahora que preferencia_usuario existe de verdad. Misma interfaz (LSP): cargarPerfil() y
// construirPerfil() no se enteran del cambio, solo cambio el import en app/lib/perfil.ts.
// db es inyectable (default dbSingleton) para poder probar el fallback a defaults sin
// tocar isps.db, mismo estilo que organizacion-repository.ts.
export class PreferenciasDbAdapter implements LeerPreferencias, GuardarPreferencias {
  private readonly db: DbInstancia;

  constructor(db: DbInstancia = dbSingleton) {
    this.db = db;
  }

  async leer(idUser: string): Promise<Preferencias> {
    const fila = leerPreferencia(idUser, this.db);
    return {
      colorAvatar: fila?.colorAvatar ?? PREFERENCIAS_DEFAULT.colorAvatar,
      vistaInicio: fila?.vistaInicio ?? PREFERENCIAS_DEFAULT.vistaInicio,
      cargo: fila?.cargo ?? PREFERENCIAS_DEFAULT.cargo,
      telefono: fila?.telefono ?? PREFERENCIAS_DEFAULT.telefono,
    };
  }

  async guardar(idUser: string, cambios: PreferenciasParciales): Promise<void> {
    guardarPreferencia(idUser, cambios, this.db);
  }
}
