# EmprenLive: chat, contactos, vitrina y Mostrador

La app web vive en `app/` (en GitHub Pages queda en `https://<tu-sitio>/app/`).
Usa el mismo proyecto de Supabase que el panel de administración.

Para probarla sin configurar nada, abre `app/?demo`: usa datos de ejemplo y no guarda nada.

## Activarla con datos reales (una sola vez)

1. **Base de datos.** En Supabase ve a **SQL Editor**, pega todo el archivo
   `migrations/20261122_chat_mostrador.sql` y presiona **Run**.
   Crea las tablas, los permisos (RLS), las funciones, los buckets de fotos y activa el tiempo real.
   Se puede ejecutar de nuevo sin romper nada.

2. **Dirección de retorno del login.** En **Authentication → URL Configuration → Redirect URLs**
   agrega la dirección de la app, por ejemplo `https://<tu-sitio>/app/`.
   Sin esto, "Continuar con Google" no vuelve a la app.

3. **Borrado automático del Mostrador** (fotos de 24 h):
   ```bash
   supabase functions deploy limpiar-mostrador --no-verify-jwt
   supabase secrets set CRON_SECRET=<una-clave-larga-al-azar>
   ```
   Luego, en **Integrations → Cron**, crea un trabajo cada hora (`0 * * * *`) de tipo
   **Supabase Edge Function** que llame a `limpiar-mostrador` con el encabezado
   `x-cron-secret: <la misma clave>`.

   Aunque este paso falte, los estados vencidos **dejan de verse a las 24 h** igual:
   la base de datos los oculta y los enlaces de las fotos caducan. La función solo libera espacio.

## Cómo funciona

| Parte | Qué hace |
| --- | --- |
| `@alias` | Columna `profiles.username`, única. Se elige al entrar por primera vez. |
| Contactos | Tabla `contactos`. Se agregan buscando el alias o al abrir un chat. |
| Chats | `chats` (1 a 1) y `mensajes`. Llegan en vivo por Supabase Realtime, con visto, "en línea" y "escribiendo…". |
| Vitrina | `catalogo`: productos de cada usuario, con foto y precio, para enviar en el chat. |
| Pedidos | Mensajes de tipo `pedido`. Solo el vendedor cambia el estado (confirmado → pagado → enviado → entregado); el comprador puede cancelar antes de que lo confirmen. |
| Mostrador | `mostrador` + bucket privado. Dura siempre 24 h (no se puede alargar). Lo ven tus contactos y quienes chatean contigo. Responder ("❤️ Me gusta este producto") manda un mensaje al chat del dueño. |
| Enlace para redes | `https://<tu-sitio>/app/#@alias` abre un chat directo con esa persona. |
