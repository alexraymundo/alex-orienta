-- NORTIA V8.3.1 — separación de notas internas y respuestas compartidas
ALTER TABLE teacher_observations ADD COLUMN private_note TEXT;
ALTER TABLE family_observations ADD COLUMN private_note TEXT;
