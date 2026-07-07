import type { NextRequest } from "next/server";
import { pingClaudeStream } from "../../adapters/claude";
import { requireSession } from "../../lib/session";

// Streaming necesita un route handler, no una server action: las actions devuelven
// una sola vez, aca podemos ir empujando cada evento a medida que llega. Formato
// NDJSON (un JSON por linea) para que el cliente lo parsee simple partiendo por \n.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await requireSession(); // nadie sin login gasta tokens del gateway

  const { prompt } = await req.json().catch(() => ({ prompt: "" }));
  const texto = typeof prompt === "string" ? prompt.trim() : "";

  const encoder = new TextEncoder();
  const linea = (obj: unknown) => encoder.encode(JSON.stringify(obj) + "\n");

  if (!texto) {
    return new Response(linea({ tipo: "error", error: "Escribe algo primero." }), {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of pingClaudeStream(texto)) {
          controller.enqueue(linea(ev));
        }
      } catch (e) {
        controller.enqueue(linea({ tipo: "error", error: e instanceof Error ? e.message : String(e) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}
