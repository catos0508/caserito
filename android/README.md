# EmprenLive para Android

App nativa que trae dentro la app web de `../app` (funciona igual que la web, con chat en vivo y Mostrador).

## Compilar el APK

Necesitas el SDK de Android (o Android Studio). Desde esta carpeta:

```bash
./gradlew assembleDebug
```

El APK queda en `build/outputs/apk/debug/EmprenLive-debug.apk`.
Antes de compilar, el proyecto copia automáticamente la versión actual de `../app` al APK.

## Ingreso con Google desde el APK

Google no permite iniciar sesión dentro de una app con WebView, así que se abre el navegador
y vuelve a la app por `emprenlive://auth`. Agrega esa dirección en Supabase:
**Authentication → URL Configuration → Redirect URLs → `emprenlive://auth`**.
El ingreso con correo y contraseña funciona sin este paso.

## Para publicar en Google Play

Genera tu propia llave de firma (guárdala bien: sin ella no podrás publicar actualizaciones) y compila
con `./gradlew bundleRelease` firmado con esa llave.
