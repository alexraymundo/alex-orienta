# NORTIA V8.5.1 — Corrección de borrador IA

## Corrección principal
Se corrigió el error que podía mostrar `La IA no devolvió un borrador estructurado`.

La generación ahora:
- acepta respuestas estructuradas en etiquetas o JSON;
- tolera saltos de línea y pequeños errores de formato;
- realiza un segundo intento automático si el primer resultado no puede interpretarse;
- no pierde ni modifica las observaciones existentes si la IA falla;
- mantiene el borrador como privado hasta que Alex lo revise y publique.

No requiere migración de D1.

# NORTIA V8.5 — Informe asistido por IA

## Qué cambia
- En `CIDEB > Informes para docentes`, Alex puede generar un **borrador con IA** incluso cuando existe una sola observación autorizada.
- La IA solo recibe observaciones docentes **revisadas** y observaciones profesionales que Alex marcó como **visibles para docentes**.
- Las notas privadas, terapia y conversaciones de NORTIA Reflexión no se usan en este borrador.
- Con 1–2 registros el sistema etiqueta la evidencia como **Datos iniciales** y prohíbe a la IA presentar tendencias o patrones estables.
- Alex siempre puede editar el borrador y **nada se publica automáticamente**.
- El docente y Coordinación ven únicamente el informe que Alex publica, no la herramienta de IA.
- Desde el Paso 1 del informe hay un botón **+ Agregar observación** para saltar directamente a `Mis observaciones` con el alumno ya seleccionado.

## Flujo recomendado
1. Selecciona alumno.
2. Revisa los registros considerados.
3. Si necesitas más contexto, usa `+ Agregar observación`.
4. Usa `Generar borrador con IA`.
5. Revisa y edita descripción, fortalezas, apoyos, estrategias y aspectos a observar.
6. Previsualiza.
7. Publica únicamente cuando estés conforme.

## Importante
Las gráficas siguen basándose solo en registros reales. La IA **no inventa datos para llenar gráficas**. Con pocos registros muestra evidencia inicial y ayuda principalmente con redacción y recomendaciones.

## Base de datos
No requiere migración nueva. El borrador generado se coloca en los campos existentes y solo se guarda cuando Alex pulsa `GUARDAR INFORME`.
