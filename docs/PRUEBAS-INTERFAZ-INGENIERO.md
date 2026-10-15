# Pruebas locales de interfaz de ingeniero

Rama compartida: `interfaz_ingeniero`. No fusionar con `main` ni `dev` para estas pruebas.

Con Node.js 20 y el repositorio ya clonado:

```sh
git fetch origin
git switch interfaz_ingeniero
git pull --ff-only origin interfaz_ingeniero
npm ci
npm run dev
```

La primera vez, si Git no encuentra la rama local, usar `git switch --track origin/interfaz_ingeniero`.
Abrir la URL que indique Vite. Guardar o confirmar los cambios locales propios antes de cambiar de rama.
Para actualizar después, repetir `git pull --ff-only origin interfaz_ingeniero` y `npm ci`.

La gráfica de demostración se activa solo en desarrollo con `VITE_DEMO_PROJECT_CHART=true` en `.env.development`.
Para desactivarla, cambiar el valor a `false` y reiniciar Vite. Las compilaciones de producción siempre usan datos reales.
Antes de la entrega final, buscar `TODO: REMOVE_DEMO_CHART_DATA`, retirar el archivo de demostración y su integración.

Ejecutar la interfaz en localhost no convierte automáticamente la API en una base de datos local: revisar el proxy de `vite.config.ts` antes de guardar datos de prueba.
