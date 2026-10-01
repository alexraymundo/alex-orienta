# NORTIA v7.3 — Seguridad + Acceso CIDEB

## Acceso visible en la página pública

En la barra superior ahora aparece un botón **CIDEB**.
Al abrirlo se muestran dos opciones:

- **Soy docente** → `/docente.html`
- **Soy padre, madre o tutor** → `/familia.html`

`Mi Espacio` continúa siendo el acceso individual de la persona atendida.
El acceso profesional de Alex sigue separado.

Los portales docente y familiar ahora se identifican claramente como **Acceso escolar · CIDEB**.

## Seguridad añadida

### Protección de intentos de acceso
Los logins de:
- Alex
- Mi Espacio
- Docentes
- Familias

quedan limitados. Después de 7 intentos incorrectos desde el mismo origen/dispositivo, se aplica un bloqueo temporal de 15 minutos.

La app crea automáticamente la tabla `security_login_attempts`. También se incluye `migration-v7.3.sql`.

### Protección contra solicitudes externas
Las operaciones que modifican datos bloquean solicitudes detectadas como `cross-site` y orígenes distintos al propio sitio.

### Encabezados de seguridad
Se agregan:
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy
- Permissions-Policy
- HSTS
- `Cache-Control: no-store` para APIs

### Menor exposición de errores
Los errores internos ya no envían detalles técnicos completos al navegador. Los detalles quedan únicamente en los logs del Worker.

### Expedientes inactivos
Los accesos de Mi Espacio y familia verifican también que el expediente siga activo.

## Siguiente capa recomendada
Cloudflare Access/MFA para `/admin.html` y `/api/admin/*`, además de Turnstile en formularios públicos y accesos, pueden agregarse como una segunda capa después de publicar esta versión.
