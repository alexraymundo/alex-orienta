# NORTIA v7.5 — Directorio CIDEB escalable

## Objetivo
Mantener el panel limpio aunque la base crezca a cientos o miles de alumnos.

## Nuevo: CIDEB > Alumnos
El módulo escolar ahora tiene un Directorio independiente con:
- búsqueda por nombre, matrícula, grado, grupo, correo o teléfono;
- filtros por ciclo, grado, grupo, docente y estado;
- paginación de 25 o 50 registros;
- favoritos locales y últimos alumnos consultados;
- ficha escolar rápida sin mezclarla con la práctica privada;
- enlace al expediente profesional cuando Alex realmente lo necesita.

La búsqueda se hace en D1 y no carga toda la base de alumnos en el navegador.

## Matrícula / ID escolar
Los alumnos creados desde CIDEB requieren matrícula/ID.
NORTIA verifica que la matrícula no esté ya asignada a otro alumno.
También advierte si ya existe una persona con el mismo nombre antes de crear una ficha duplicada.

## Importación CSV
CIDEB > Alumnos > IMPORTAR CSV.

Encabezados recomendados:
`matricula,nombre,edad,grado,grupo,ciclo,correo,telefono`

Obligatorios:
- matricula
- nombre
- ciclo

La interfaz muestra una previsualización antes de importar y omite matrículas duplicadas.
Máximo por carga: 500 filas.

## Cambio de ciclo escolar
CIDEB > Alumnos > NUEVO CICLO.

Al crear un ciclo nuevo:
- se conserva el historial del ciclo anterior;
- la inscripción anterior pasa a completada;
- se crea una nueva inscripción actual;
- se cierran asignaciones docentes del ciclo anterior;
- grado/grupo NO se adivinan: quedan marcados para revisión.

## Informes de continuidad
Cada vez que Alex publica un informe, NORTIA crea una nueva versión histórica (V1, V2, V3...).
Guardar como borrador no crea una versión publicada.

## Dashboard CIDEB
Ahora muestra pendientes operativos:
- alumnos sin docente;
- observaciones por revisar;
- alumnos sin informe publicado;
- consentimientos familiares pendientes;
- alumnos cuyo grado/grupo debe revisarse tras cambio de ciclo.

## Buscador global
En la parte superior del Panel Profesional hay un buscador único.
Puede encontrar tanto personas de la práctica privada como alumnos CIDEB y los abre en el espacio correspondiente.

## Portal docente
Los docentes ahora pueden buscar rápidamente dentro de sus propios alumnos asignados.
No pueden buscar alumnos que no tengan asignados.

## Exportación
Desde la ficha escolar rápida puede descargarse una copia estructurada `.json` con los datos escolares enlazados al alumno para respaldo o portabilidad autorizada.

## Base de datos
Se agregan:
- `school_enrollments`
- `school_continuity_versions`

Incluido: `migration-v7.5.sql`.
La aplicación también intenta crear las tablas automáticamente.

No es necesario borrar ni recrear D1.
