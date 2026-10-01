# NORTIA V8.3.1 — Revisión final de calidad y UX

Parte de V8.2 y consolida una revisión completa desde cinco perfiles: visitante, Mi Espacio, familia, docente y administrador.

## Mejoras principales
- Mi práctica y CIDEB permanecen visual y funcionalmente separados.
- El resumen CIDEB se centra en pendientes y accesos rápidos, no en repetir todos los módulos.
- Portal Familiar por pestañas: Resumen / Compartir observación / Historial.
- Docentes y familias cuentan con borrador local automático durante la sesión.
- El informe docente trata muestras menores a 3 registros como “datos iniciales”.
- Se separaron claramente las notas internas de Alex de las respuestas visibles para docente/familia.
- Dashboard privado con indicadores accionables.
- Turnstile es opcional: sin claves, la agenda pública funciona con rate limit. Si solo se configura una clave, el sistema lo detecta como configuración incompleta.
- Validación de contacto, correo, fechas, horarios y tipo de servicio.
- Para menores, los campos de tutor se muestran y envían solo cuando corresponden.
- Las citas solo se vinculan automáticamente por correo único, no por teléfono compartido.
- Alertas AI del dashboard muestran alertas pendientes de revisión, no un acumulado histórico duplicado.
- Mejoras de contraste, teclado, foco, touch targets, móvil y reducción de movimiento.
- Mensajes operativos no bloqueantes (toasts) en lugar de alertas del navegador cuando aplica.

## Base de datos
La app agrega automáticamente `private_note` a observaciones docentes/familiares cuando haga falta. `migration-v8.3.sql` queda como respaldo para una migración manual desde V8.2; no necesitas ejecutarla si dejas que NORTIA haga la actualización automática.

## Antes de datos reales de menores
Sigue pendiente la validación jurídica del aviso de privacidad, consentimiento y acuerdos de confidencialidad según el contexto real de uso.

No necesitas Zero Trust para que V8.3.1 funcione. MFA en GitHub/Cloudflare sigue siendo recomendable y se administra fuera de NORTIA.
