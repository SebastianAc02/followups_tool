// El core define QUE necesita/escribe el perfil sobre preferencias, no COMO se
// persisten. Dos interfaces separadas por ISP (mismo estilo que IAPort/SyncAdapter):
// el consumidor de solo lectura (Fase 1: menu, /perfil) depende SOLO de
// LeerPreferencias y nunca ve el metodo de escribir. GuardarPreferencias queda
// declarada para Fase 2 (edicion), sin implementacion todavia.
//
// LSP: leer() SIEMPRE devuelve Preferencias con los defaults aplicados cuando no hay
// fila (nunca null, nunca throw por "no existe"). El adapter de defaults de Fase 1,
// el repo real de Fase 2 y un doble en memoria para tests son sustituibles sin que
// construirPerfil() se entere.
import type { Preferencias, PreferenciasParciales } from '../perfil';

export interface LeerPreferencias {
  leer(idUser: string): Promise<Preferencias>;
}

export interface GuardarPreferencias {
  guardar(idUser: string, cambios: PreferenciasParciales): Promise<void>;
}
