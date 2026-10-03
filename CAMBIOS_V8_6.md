# NORTIA v8.6 — Flujo centrado en Alex

## Cambio principal
NORTIA deja de depender de que el docente capture observaciones estructuradas. Alex concentra la información escolar y controla qué evidencia se integra al expediente y al informe visual.

## Portal docente
- El foco es consultar el informe de continuidad.
- `Registrar observación` cambia a `Agregar comentario`.
- Se elimina del portal docente la captura de escalas, antecedente, estrategia y resultado.
- El comentario docente es opcional y complementario.
- La interfaz aclara que el comentario no entra automáticamente al expediente ni a las gráficas.
- `Mis registros` cambia a `Mis comentarios`.

## Panel de Alex
- Los aportes de docentes aparecen como `Comentarios docentes`.
- Cada comentario tiene la decisión explícita `Integrar al expediente`.
- Si Alex no activa esa opción, el comentario queda como antecedente revisado.
- Solo los comentarios docentes expresamente integrados pueden alimentar gráficas o el borrador con IA.
- Las observaciones profesionales de Alex continúan siendo la fuente principal de evidencia.

## Datos / migración
Se agrega a `teacher_observations`:

`included_in_record INTEGER NOT NULL DEFAULT 0`

Aplicar `migration-v8.6.sql` en D1 antes o junto con el despliegue. El Worker también intenta asegurar la columna al inicializar el módulo escolar.

## Sin cambios
- Transferencias entre docentes.
- Expediente permanente por alumno.
- Coordinación.
- IA exclusiva de Alex.
- Publicación manual del informe.
- Notas privadas.
- Seguridad y auditoría.
