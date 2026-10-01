# NORTIA v7.5.2 — Exportación CIDEB

## Nuevo botón en CIDEB > Alumnos
Junto a `IMPORTAR CSV` ahora aparece:

`EXPORTAR CSV`

## Qué exporta
Exporta todos los alumnos que coinciden con los filtros actuales del directorio,
no únicamente los 25 o 50 que están visibles en la página.

Respeta:
- búsqueda
- ciclo escolar
- grado
- grupo
- docente
- estado activo/archivado

## Columnas
- Matrícula
- Nombre
- Edad
- Grado
- Grupo
- Ciclo escolar
- Docente(s)
- Estado
- Correo
- Teléfono
- Observaciones pendientes
- Informe publicado
- Accesos familiares

El archivo se genera en CSV UTF-8 y abre correctamente en Excel.

## No cambia
- D1
- estructura de tablas
- accesos
- seguridad
- importación
- informes visuales

No requiere migración nueva.
