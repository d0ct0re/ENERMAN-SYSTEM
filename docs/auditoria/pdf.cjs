// Genera el PDF del reporte de cumplimiento a partir de cumplimiento-projectra.html.
// Uso (desde la raíz del repo): node docs/auditoria/pdf.cjs
// Usa el navegador que haya: Edge (Windows), Chrome (Mac/Windows) o el Chromium de Playwright.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const dir = __dirname;
  const out = path.join(dir, 'Reporte-Cumplimiento-Projectra.pdf');
  const body = fs.readFileSync(path.join(dir, 'cumplimiento-projectra.html'), 'utf8');
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="margin:0">' + body + '</body></html>';
  let b;
  for (const opts of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]) {
    try { b = await chromium.launch(opts); break; } catch { /* probar el siguiente */ }
  }
  if (!b) throw new Error('No hay navegador disponible: instala Chrome o corre `npx playwright install chromium`.');
  const p = await b.newPage();
  await p.emulateMedia({ colorScheme: 'light', media: 'print' });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.pdf({
    path: out, format: 'Letter', printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">Cumplimiento de Projectra · pág. <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
  });
  await b.close();
  console.log('PDF generado:', out);
})().catch(e => { console.error(e.message); process.exit(1); });
