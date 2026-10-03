# RAUDAL — cambio de marca sobre V8.5.1

Esta versión conserva la lógica, D1, permisos, sesiones y estructura técnica de la versión NORTIA V8.5.1.

## Cambios incluidos
- Marca visible: NORTIA → RAUDAL.
- Marca gráfica textual: N → R.
- NORTIA Reflexión → RAUDAL Reflexión.
- Títulos, metadatos, avisos, paneles y correos visibles actualizados.
- Nuevos códigos de acceso usan prefijo `RD-`. Los códigos existentes siguen siendo válidos porque la validación se basa en su hash.
- Línea de marca: “Impulso para tu siguiente paso”.

## Se conserva intencionalmente
- Nombre técnico del Worker y package: `alex-orienta`.
- Base D1 `alex-orienta` y su `database_id`.
- Cookies/sesiones internas y claves técnicas `nortia_*`.
- Esquema SQL y migraciones.

Esto evita romper datos, sesiones o despliegue. Si se desea cambiar la URL pública, el nombre del Worker o el repositorio de GitHub a RAUDAL, conviene hacerlo como paso de despliegue separado.
