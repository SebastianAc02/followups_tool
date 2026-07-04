import { and, eq, lte, isNotNull, desc, sql } from 'drizzle-orm';
import { db } from './index';
import { empresa, contacto, empresaUsuarios, toque, syncCambios } from './schema';

// Único punto de acceso a datos. El resto de la app no toca SQL ni la DB directo.

// Calor de la cuenta (prioridad): lo más cerca del cierre, primero.
const calorDesc = sql`(CASE ${empresa.estadoNotion}
  WHEN 'cierre_documentacion' THEN 5
  WHEN 'enviar_contrato' THEN 5
  WHEN 'reunion_agendada' THEN 4
  WHEN 'oportunidad' THEN 4
  WHEN 'contacto_iniciado' THEN 2
  WHEN 'on_hold' THEN 0
  ELSE 1 END) DESC`;

// Cola del día de un owner: vencidos o para hoy, ordenados por calor y luego antigüedad.
export function colaDelDia(hoy: string, owner: string) {
  return db
    .select({
      id: empresa.idEmpresa,
      empresa: empresa.nombreOficial,
      ciudad: empresa.ciudadPrincipal,
      estado: empresa.estadoNotion,
      crm: empresa.crmSoftware,
      pasarela: empresa.pasarelaActual,
      proximoPaso: empresa.proximoPaso,
      canal: empresa.proximoCanal,
      fecha: empresa.proximoFollowUpFecha,
      contacto: contacto.nombre,
      cargo: contacto.cargo,
      usuarios: empresaUsuarios.usuariosEfectivos,
    })
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.owner, owner),
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
      ),
    )
    .orderBy(calorDesc, empresa.proximoFollowUpFecha)
    .all();
}

export function getCuenta(id: string) {
  const emp = db
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      ciudad: empresa.ciudadPrincipal,
      departamento: empresa.departamento,
      estado: empresa.estadoNotion,
      crm: empresa.crmSoftware,
      pasarela: empresa.pasarelaActual,
      owner: empresa.owner,
      categoria: empresa.categoria,
      proximoPaso: empresa.proximoPaso,
      fecha: empresa.proximoFollowUpFecha,
      usuarios: empresaUsuarios.usuariosEfectivos,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(eq(empresa.idEmpresa, id))
    .get();

  const contactos = db
    .select({
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      telefono: contacto.telefono,
      email: contacto.email,
      esPrincipal: contacto.esPrincipal,
    })
    .from(contacto)
    .where(eq(contacto.idEmpresa, id))
    .all();

  const toques = db
    .select({ fecha: toque.fecha, canal: toque.canal, resultado: toque.resultado, quePaso: toque.quePaso })
    .from(toque)
    .where(eq(toque.idEmpresa, id))
    .orderBy(desc(toque.idToque))
    .limit(5)
    .all();

  return { emp, contactos, toques };
}

// Registrar un toque: escribe el evento (toque) y actualiza el estado actual (empresa). Atómico.
export function registrarToque(input: {
  idEmpresa: string;
  resultado: string;
  quePaso?: string;
  proximoFollowUp?: string;
  proximoCanal?: string;
  usuarios?: number;
  crm?: string;
  pasarela?: string;
}) {
  const ahora = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(toque)
      .values({
        idEmpresa: input.idEmpresa,
        fecha: ahora,
        canal: 'llamada',
        resultado: input.resultado,
        quePaso: input.quePaso ?? null,
        proximoFollowUpFecha: input.proximoFollowUp ?? null,
        fuente: 'cockpit',
        createdAt: ahora,
      })
      .run();

    const sets: Record<string, unknown> = { updatedAt: sql`datetime('now')` };
    if (input.proximoFollowUp) sets.proximoFollowUpFecha = input.proximoFollowUp;
    if (input.proximoCanal) sets.proximoCanal = input.proximoCanal;
    if (input.crm) sets.crmSoftware = input.crm;
    if (input.pasarela) sets.pasarelaActual = input.pasarela;
    tx.update(empresa).set(sets).where(eq(empresa.idEmpresa, input.idEmpresa)).run();

    if (input.usuarios != null && !Number.isNaN(input.usuarios)) {
      tx.insert(empresaUsuarios)
        .values({ idEmpresa: input.idEmpresa, usuariosEstimados: input.usuarios })
        .onConflictDoUpdate({ target: empresaUsuarios.idEmpresa, set: { usuariosEstimados: input.usuarios } })
        .run();
    }

    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'toque',
        idRegistro: input.idEmpresa,
        accion: 'insert',
        detalle: `${input.resultado} -> next ${input.proximoFollowUp ?? '-'}`,
      })
      .run();
  });
}

// Repartir el backlog de follow-ups de un owner: N por día hábil, lo más caliente primero.
export function repartirFollowups(owner: string, porDia: number) {
  const rows = db
    .select({ id: empresa.idEmpresa })
    .from(empresa)
    .where(and(eq(empresa.owner, owner), isNotNull(empresa.proximoFollowUpFecha)))
    .orderBy(calorDesc, empresa.proximoFollowUpFecha)
    .all();

  const necesarios = Math.ceil(rows.length / porDia) || 0;
  const dias: string[] = [];
  const d = new Date();
  while (dias.length < necesarios) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dias.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  db.transaction((tx) => {
    rows.forEach((r, i) => {
      const fecha = dias[Math.floor(i / porDia)];
      tx.update(empresa)
        .set({ proximoFollowUpFecha: fecha, updatedAt: sql`datetime('now')` })
        .where(eq(empresa.idEmpresa, r.id))
        .run();
    });
    tx.insert(syncCambios)
      .values({
        fecha: new Date().toISOString(),
        corrida: 'repartir',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: owner,
        accion: 'update',
        detalle: `repartir ${rows.length} follow-ups a ${porDia}/dia`,
      })
      .run();
  });

  return { total: rows.length, porDia, hasta: dias[dias.length - 1] ?? null };
}
