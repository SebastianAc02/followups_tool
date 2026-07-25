// Que tools tiene el MCP corriendo AHORA, y desde cuando. Existe para sacar el SSH del ciclo de
// deploy: verificar que un cambio llego costaba tres comandos contra el VPS (git log, docker
// inspect, y un grep dentro del build de Next), y la pregunta real siempre era la misma, "esta la
// tool que acabo de escribir".
//
// PUBLICO a proposito, sin sesion: es diagnostico de despliegue, y exigirle OAuth lo volveria
// inutil para lo unico que sirve (un curl despues del deploy). No devuelve NADA de negocio: solo
// nombres de tools, que ya son publicos para cualquier cliente autenticado, y una hora de
// arranque. Llamarlas sigue exigiendo OAuth y el gate de escritura.
import { NextResponse } from 'next/server';
import { TOOLS_LECTURA, TOOLS_ESCRITURA, ARRANCADO_EN } from '../../../mcp/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    arrancadoEn: ARRANCADO_EN,
    tools: {
      lectura: [...TOOLS_LECTURA],
      // Solo se registran si la sesion pasa puedeEscribirMcp. Que aparezcan aca significa que el
      // servidor las CONOCE, no que quien pregunta pueda usarlas.
      escritura: [...TOOLS_ESCRITURA],
      total: TOOLS_LECTURA.length + TOOLS_ESCRITURA.length,
    },
  });
}
