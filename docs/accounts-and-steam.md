# Cuentas, progreso remoto y preparación para Steam

## Autoridad de identidad

Arca Epsilon usa un UUID interno como identidad estable. El correo y Steam son
identidades vinculadas, no claves primarias del progreso. El cliente nunca
concede DLC, naves premium ni recompensas de pago.

## Estado actual

- Sin variables Supabase, el juego conserva el modo invitado y todas las claves
  históricas de `localStorage`.
- Una cuenta autenticada usa almacenamiento local separado por UUID.
- En el primer acceso, el perfil y la partida del invitado se copian al ámbito
  de la cuenta y se sincronizan con la nube.
- Los saves usan revisión optimista. Un dispositivo no puede sobrescribir en
  silencio una revisión remota desconocida.
- Los permisos de nave provienen de `player_entitlements`, que el navegador solo
  puede leer.

## Configuración Supabase

1. Crear un proyecto Supabase.
2. Ejecutar `supabase/migrations/202608180001_accounts_and_cloud_saves.sql`.
3. Configurar URL del sitio y redirects para localhost y Vercel.
4. Activar confirmación de correo.
5. Configurar SMTP propio antes de producción.
6. Definir en `.env.local` y en Vercel:

```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

La clave publicable respeta RLS. Una `secret` o `service_role` nunca debe usar el
prefijo `VITE_` ni llegar al bundle.

## Adaptador Steam posterior

El ejecutable de Steam obtendrá un ticket mediante Steamworks. Una función
servidora verificará ese ticket con Valve, localizará o creará el UUID interno y
registrará una fila `account_identities(provider = 'steam')`. La Publisher Key
de Steam existirá solo como secreto del servidor.

Steam Cloud puede conservar una copia local del archivo de save, pero la tabla
`save_slots` seguirá siendo la autoridad multiplataforma para navegador y Steam.

## Pendientes de producción

- Endpoint autenticado para exportación y eliminación completa de cuenta.
- CAPTCHA y límites de intentos en registro y recuperación.
- Política de privacidad, términos y retención de datos revisados legalmente.
- Función de verificación de Steam Auth Tickets cuando exista AppID.
- Herramienta administrativa auditada para conceder DLC y entitlements.
