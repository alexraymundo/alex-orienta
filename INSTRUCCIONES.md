# NORTIA V8.4 — Coordinación CIDEB + transferencias de docente

## Modelo escolar definitivo
NORTIA mantiene **una sola ficha permanente por alumno**. No crea un alumno nuevo cada semestre.

La ficha escolar muestra únicamente:
- periodo actual;
- grado y grupo actuales;
- **un maestro actual**;
- continuidad publicada vigente.

La base conserva un historial técnico mínimo de transferencias únicamente para auditoría. Ese historial no duplica el expediente del alumno.

## Periodos CIDEB
Usa etiquetas simples:
- `2027-1` = enero–junio 2027
- `2027-2` = agosto–diciembre 2027

`Nuevo periodo` actualiza la ficha escolar actual. No crea otra ficha y no cambia al maestro automáticamente.

## Transferir docente
Desde la ficha CIDEB del alumno, Alex puede usar `TRANSFERIR DOCENTE`.

Al confirmar:
1. se cierra el acceso activo del maestro anterior a ese alumno;
2. el nuevo maestro se convierte en el maestro actual;
3. se guarda una fotografía de la continuidad que estaba publicada en ese momento;
4. el nuevo docente recibe esa entrega en su portal;
5. las notas privadas, terapia, IA y contenido no publicado permanecen fuera de la transferencia.

Si no había un informe publicado, la transferencia puede realizarse, pero el portal docente indicará que todavía no existía un resumen profesional para entregar.

Alex puede deshacer la última transferencia durante una ventana corta si el nuevo docente todavía no ha enviado observaciones.

## Nuevo rol: Coordinación CIDEB
Acceso: `/coordinacion.html`

Código nuevo: `NT-C-XXXX-XXXX`

Coordinación puede:
- consultar todos los alumnos CIDEB;
- buscar por nombre/matrícula/grado/grupo;
- ver maestro actual y periodo;
- consultar únicamente continuidad escolar publicada;
- ver aportes profesionales que Alex publicó para el contexto escolar;
- transferir el alumno de un maestro a otro.

Coordinación **no puede**:
- entrar a Mi práctica;
- consultar NORTIA Reflexión ni conversaciones de IA;
- ver notas privadas o terapia;
- eliminar expedientes;
- administrar seguridad global;
- modificar observaciones privadas de Alex.

Alex administra coordinadores desde `CIDEB > Coordinación`: crear acceso, desactivar/reactivar y regenerar código.

## Portal Docente
El docente solo ve alumnos que tiene asignados actualmente.

Cuando recibe un alumno transferido aparece `CONTINUIDAD RECIBIDA`, con la información que estaba publicada cuando se realizó el cambio. El maestro anterior deja de tener acceso activo al alumno.

## Base de datos
Se agregan:
- `coordinators`
- `teacher_transfers`

La aplicación intenta crear estas tablas automáticamente. También se incluye `migration-v8.4.sql` como respaldo.

No es necesario borrar ni recrear D1.
