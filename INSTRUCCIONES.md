# ALEX ORIENTA v5 — Mi Espacio + ficha flexible

## IMPORTANTE: ejecutar migración D1

Esta versión agrega nuevas tablas. Antes de probar v5:

1. Cloudflare > D1 > alex-orienta > Console / Studio.
2. Abre `migration-v5.sql`.
3. Copia todo el contenido.
4. Pégalo en la consola D1.
5. Ejecuta.

No borra las tablas anteriores ni los datos existentes.

## Nuevo portal del usuario

URL:
`/mi-espacio.html`

Flujo:
1. Alex abre una persona en Admin > Personas.
2. Presiona `CREAR / REGENERAR ACCESO`.
3. El sistema genera un código como `AO-ABCD-2345`.
4. Alex lo entrega a la persona.
5. La persona entra a Mi Espacio y escribe el código.
6. El navegador recibe una sesión privada HttpOnly de 12 horas.

## Reflexión AI para usuarios

Por defecto está DESHABILITADA.

En la ficha de la persona Alex debe:
- confirmar consentimiento;
- habilitar Reflexión AI.

Para menores, la interfaz recuerda que debe existir el consentimiento correspondiente.

La IA nunca recibe las notas privadas de Alex.

Puede recibir:
- Mapa Vocacional;
- Plan de orientación;
- `ai_context`;
- campos personalizados marcados como `Solo contexto para IA` o `Visible + contexto para IA`;
- resúmenes/acuerdos que Alex decidió compartir.

## Ficha profesional flexible

Cada persona ahora puede tener:

### Seguimientos / sesiones
- Fecha
- Título
- Nota privada de Alex
- Resumen compartido
- Acuerdos
- Siguientes pasos

### Campos personalizados
Alex puede crear cualquier campo:
- Solo Alex
- Visible en Mi Espacio
- Solo contexto para IA
- Visible + contexto para IA

Ejemplos:
- Universidades consideradas
- Situación escolar
- Preferencias
- Objetivo actual
- Conversación pendiente
- Observación relevante

### Actividades
Alex puede dejar ejercicios entre sesiones.
La persona puede marcarlos como completados desde Mi Espacio.

## Seguridad

- Admin y cliente usan sesiones separadas.
- Código del usuario se guarda hasheado; no se almacena en texto plano.
- Regenerar acceso invalida el código anterior.
- Notas privadas no se envían a la IA ni al portal del usuario.
- La IA para cliente solo funciona si Alex la habilitó y existe consentimiento confirmado.

## URL

Público:
`/`

Panel Alex:
`/admin.html`

Usuario:
`/mi-espacio.html`
