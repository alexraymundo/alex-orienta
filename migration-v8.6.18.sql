-- RAUDAL V8.6.18
-- Eliminación segura de docentes sin borrar historial.
ALTER TABLE teachers ADD COLUMN archived_at TEXT;
