# NORTIA v6.2 — Centro de Notificaciones + correo

## Destino fijo
Todas las notificaciones por correo se envían a:

`alex_raymundo@hotmail.com`

La dirección no se muestra en la página pública.

## Qué notifica

NORTIA genera una notificación cuando:

1. Llega una nueva solicitud de cita.
2. Una persona marca una actividad como completada.
3. NORTIA Reflexión detecta lenguaje que activa una alerta de revisión humana.
4. Una persona alcanza su límite diario de mensajes de NORTIA Reflexión.

Las notificaciones quedan guardadas también dentro de:
`Panel Profesional > Notificaciones`

## Privacidad

Los correos NO incluyen:
- notas privadas;
- contenido completo de conversaciones de IA;
- expedientes;
- comentarios sensibles.

En una alerta de IA, el correo solo indica que existe una alerta y pide entrar al Panel Profesional.

## Configurar el correo

Esta versión usa Resend desde el Worker mediante su API HTTP.

### 1. Crear cuenta Resend

Usa la cuenta de Alex / el correo que recibirá las notificaciones:

`alex_raymundo@hotmail.com`

### 2. Crear API Key

En Resend:
`API Keys > Create API Key`

No pegues esa clave dentro del código ni la compartas en el chat.

### 3. Guardarla en Cloudflare

Worker `alex-orienta` / NORTIA:

`Settings > Variables and Secrets > Add`

Nombre:
`RESEND_API_KEY`

Valor:
la API key generada por Resend.

Tipo:
Secret

### 4. Remitente

Mientras uses el remitente de prueba, NORTIA usa:

`NORTIA <onboarding@resend.dev>`

Si después conectas un dominio propio, agrega en Cloudflare:

`RESEND_FROM_EMAIL`

Ejemplo:
`NORTIA <notificaciones@tudominio.com>`

### 5. Probar

Entra a:

`Panel Profesional > Notificaciones`

y presiona:

`PROBAR CORREO`

El sistema mostrará el error real si la configuración no está completa.

## Base de datos

La app intenta crear automáticamente la tabla `notifications`.

También se incluye:
`migration-v6.2.sql`

por si quieres crearla manualmente desde D1.

## Importante

No necesitas borrar ni recrear:
- personas;
- citas;
- mapas;
- accesos;
- conversaciones;
- límites de IA.
