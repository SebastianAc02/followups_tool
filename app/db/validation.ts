import { z } from 'zod';

// Regla de dominio (no de UI): las 4 salidas cerradas de un toque, y razonPerdida es
// obligatoria cuando resultado = 'contesto_no'. Vive junto al Repository porque es la
// fuente de verdad que CUALQUIER caller (server action, ingest worker de Fase 3,
// EnvioAdapter de Fase 5) debe cumplir. Un solo export reusable, no se duplica en otro lado.

export const CANALES = ['llamada', 'whatsapp', 'correo'] as const;
export type Canal = (typeof CANALES)[number];

export const RESULTADOS = [
  'contesto_reunion',
  'contesto_sigue_seguimiento',
  'contesto_no',
  'no_contesto',
] as const;
export type Resultado = (typeof RESULTADOS)[number];

export const kdmSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().min(1).optional(),
});

export const registrarToqueSchema = z
  .object({
    idEmpresa: z.string().min(1),
    canal: z.enum(CANALES),
    resultado: z.enum(RESULTADOS),
    quePaso: z.string().min(1).optional(),
    proximoFollowUp: z.string().min(1).optional(),
    proximoCanal: z.string().min(1).optional(),
    usuarios: z.number().optional(),
    crm: z.string().min(1).optional(),
    pasarela: z.string().min(1).optional(),
    razonPerdida: z.string().min(1).optional(),
    objecion: z.string().min(1).optional(),
    kdm: kdmSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.resultado === 'contesto_no' && !data.razonPerdida) {
      ctx.addIssue({
        code: 'custom',
        path: ['razonPerdida'],
        message: "razonPerdida es obligatoria cuando resultado es 'contesto_no'",
      });
    }
  });

export type RegistrarToqueInput = z.infer<typeof registrarToqueSchema>;
