-- empresa_usuarios.usuarios_reales / usuarios_reales_fuente / usuarios_est_fuente /
-- actualizado_en / actualizado_por (T12) ya existen en isps.db real (columnas heredadas,
-- recien mapeadas en Drizzle para poder escribir usuarios_est_fuente='notion'). No-op a
-- proposito: correr los ADD COLUMN generados automaticamente reventaria con "duplicate
-- column name" contra la DB real.
SELECT 1;
