// Verifica que un deploy de verdad llegó al sitio en vivo. Funciona igual en Windows y Mac.
//
//   node scripts/verify-deploy.mjs prod       → compara contra https://ampr.site/
//   node scripts/verify-deploy.mjs staging    → compara contra https://ampr.site/staging/
//
// 1. Bundle: el index.js que sirve el sitio debe ser el mismo que el del build local
//    (hacer antes `npm run build` para prod o `npm run build:staging` para staging,
//    desde el mismo commit que se publicó).
// 2. Seguridad: los archivos internos de la API no deben responder por HTTP
//    (diag.php llegó a quedar público en producción — hallazgo H1 de la auditoría).
//
// Sale con código 1 si algo no cuadra, para que nadie tome por bueno un deploy a medias.
import { readFileSync, existsSync } from 'node:fs';

const target = process.argv[2];
const BASES = { prod: 'https://ampr.site/', staging: 'https://ampr.site/staging/' };
if (!BASES[target]) {
  console.error('Uso: node scripts/verify-deploy.mjs <prod|staging>');
  process.exit(2);
}
const base = BASES[target];
const BUNDLE_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;
let ok = true;

// ── 1. Bundle local vs en vivo ──
if (!existsSync('dist/index.html')) {
  console.error(`✗ No existe dist/index.html. Corre primero ${target === 'prod' ? 'npm run build' : 'npm run build:staging'}.`);
  process.exit(2);
}
const expected = readFileSync('dist/index.html', 'utf8').match(BUNDLE_RE)?.[0];
const liveHtml = await (await fetch(base, { cache: 'no-store' })).text();
const live = liveHtml.match(BUNDLE_RE)?.[0];
console.log(`Bundle local:   ${expected ?? '(no encontrado)'}`);
console.log(`Bundle en vivo: ${live ?? '(no encontrado)'}`);
if (!expected || expected !== live) {
  ok = false;
  console.log('✗ El sitio en vivo NO sirve este build. El deploy no se completó, o el build local no es del mismo commit.');
} else {
  console.log('✓ El sitio en vivo sirve este build.');
}

// ── 2. Archivos internos de la API no expuestos ──
for (const file of ['api/diag.php', 'api/config.php', 'api/config.example.php']) {
  const res = await fetch(base + file, { redirect: 'manual' });
  const body = res.status === 200 ? await res.text() : '';
  // Un 200 con el index.html del frontend (reescritura del SPA) no expone nada; un 200 con JSON o PHP sí.
  const exposed = res.status === 200 && !BUNDLE_RE.test(body) && body.trim() !== '';
  console.log(`${exposed ? '✗' : '✓'} ${file} → HTTP ${res.status}${exposed ? ' (EXPUESTO)' : ''}`);
  if (exposed) ok = false;
}

process.exit(ok ? 0 : 1);
