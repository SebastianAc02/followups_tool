-- empresa_clasificacion (T7) y contacto.linkedin (T11) ya existen en isps.db real
-- (columnas/tabla heredadas, nunca antes mapeadas en Drizzle). No-op a proposito:
-- correr el CREATE TABLE / ADD COLUMN generado automaticamente reventaria con
-- "table already exists" / "duplicate column name" contra la DB real.
SELECT 1;
