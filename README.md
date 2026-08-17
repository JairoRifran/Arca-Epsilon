# Arca Epsilon

Videojuego 3D web de exploracion, aventura y ciencia ficcion desarrollado con Three.js, TypeScript y Vite.

## Requisitos

- Node.js 20 o superior
- pnpm 10.22.0

## Desarrollo local

```bash
pnpm install --frozen-lockfile
pnpm dev
```

La aplicacion queda disponible en `http://127.0.0.1:5173`.

## Build de produccion

```bash
pnpm build
pnpm preview
```

El resultado se genera en `dist/`.

## Pruebas

```bash
pnpm test:visual
```

## Despliegue en Vercel

1. Importar `JairoRifran/Arca-Epsilon` desde el panel de Vercel.
2. Mantener el directorio raiz del proyecto en blanco.
3. Usar el preset `Vite`.
4. Confirmar `pnpm run build` como Build Command.
5. Confirmar `dist` como Output Directory.

`vercel.json` deja estos valores versionados para que los previews y la produccion usen la misma configuracion.

## Variables locales

El juego no necesita claves privadas durante la ejecucion en el navegador. Las claves de ElevenLabs se usan solamente con los scripts locales de generacion de audio y deben vivir en `.env.local`, archivo excluido de Git. `.env.example` contiene unicamente valores de ejemplo.

## Assets

Los modelos, imagenes y audios necesarios durante el juego se sirven desde `public/`. El navegador nunca realiza llamadas a ElevenLabs durante una partida.
