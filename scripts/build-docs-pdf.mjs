/**
 * Genera los PDF de la documentación a partir de los .md (fuente de verdad).
 *
 * Renderiza DOCUMENTACION_COMPLETA_DEL_PROYECTO.md y MANUAL_DE_USUARIO.md a HTML
 * (con las imágenes de docs/img/ embebidas) y los imprime a PDF con el Chromium de
 * Playwright. No requiere pandoc/wkhtmltopdf ni conexión a internet.
 *
 * Uso:  node scripts/build-docs-pdf.mjs
 *
 * Regenera los PDF cada vez que cambie alguno de los dos .md o las capturas de
 * docs/img/ (ver scripts/capture-docs-screenshots.mjs para las capturas).
 */
import { chromium } from "@playwright/test";
import { marked } from "marked";
import { readFile, writeFile, stat, unlink } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const DOCS = [
  { md: "DOCUMENTACION_COMPLETA_DEL_PROYECTO.md", pdf: "DOCUMENTACION_COMPLETA_DEL_PROYECTO.pdf" },
  { md: "MANUAL_DE_USUARIO.md", pdf: "MANUAL_DE_USUARIO.pdf" },
];

const CSS = `
  @page { size: A4; margin: 20mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Calibri, Arial, sans-serif;
    color: #2C1F15;
    line-height: 1.5;
    font-size: 10.5pt;
  }
  h1, h2, h3, h4 {
    font-family: "Segoe UI Semibold", "Segoe UI", Arial, sans-serif;
    color: #2C1F15;
    font-weight: 700;
    break-after: avoid;
  }
  h1 { font-size: 20pt; border-bottom: 3px solid #C1643F; padding-bottom: 6px; margin-top: 0; }
  h2 { font-size: 15pt; border-bottom: 1px solid #E0D5CA; padding-bottom: 4px; margin-top: 28px; break-before: page; }
  h2:first-of-type { break-before: avoid; }
  h3 { font-size: 12.5pt; color: #A8522F; margin-top: 20px; }
  h4 { font-size: 11pt; margin-top: 14px; }
  a { color: #C1643F; text-decoration: none; }
  code {
    font-family: "Consolas", "Courier New", monospace;
    background: #F2EDE6;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 9pt;
  }
  pre {
    background: #2C1F15;
    color: #FAF7F2;
    padding: 10px 12px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 8.5pt;
    break-inside: avoid;
  }
  pre code { background: none; color: inherit; padding: 0; }
  blockquote {
    border-left: 3px solid #C1643F;
    margin: 12px 0;
    padding: 4px 14px;
    background: #F2EDE6;
    color: #7A6358;
    break-inside: avoid;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 9pt;
    break-inside: avoid;
  }
  th, td {
    border: 1px solid #E0D5CA;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #F2EDE6; font-weight: 700; }
  img {
    max-width: 100%;
    border: 1px solid #E0D5CA;
    border-radius: 6px;
    margin: 10px 0;
    break-inside: avoid;
  }
  ul, ol { margin: 6px 0; padding-left: 22px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #E0D5CA; margin: 18px 0; }
  p { margin: 8px 0; }
`;

function toFileUrl(p) {
  return "file:///" + path.resolve(ROOT, p).replace(/\\/g, "/");
}

/** Reescribe rutas de imagen relativas (docs/img/x.png) a file:// absolutas. */
function resolveImagePaths(html) {
  return html.replace(/src="([^"]+)"/g, (match, src) => {
    if (/^(https?:|file:|data:)/.test(src)) return match;
    return `src="${toFileUrl(src)}"`;
  });
}

async function buildOne(browser, { md, pdf }) {
  const mdPath = path.join(ROOT, md);
  const source = await readFile(mdPath, "utf-8");
  const bodyHtml = resolveImagePaths(marked.parse(source));

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${md}</title>
<style>${CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`;

  // Chromium bloquea cargar recursos file:// desde una página creada con
  // setContent() (origen about:blank). Se escribe un HTML temporal y se navega
  // con page.goto("file://…") para que el documento tenga origen file:// también.
  const tmpHtmlPath = path.join(ROOT, `.${path.basename(md, ".md")}.tmp.html`);
  await writeFile(tmpHtmlPath, html, "utf-8");

  const page = await browser.newPage();
  await page.goto(toFileUrl(path.relative(ROOT, tmpHtmlPath)), { waitUntil: "networkidle" });
  // Espera a que todas las imágenes locales terminen de decodificar.
  const imgStatus = await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(
      imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; })))
    );
    return imgs.map((img) => ({ src: img.src, ok: img.naturalWidth > 0 }));
  });
  const broken = imgStatus.filter((i) => !i.ok);
  if (broken.length > 0) {
    throw new Error(`${broken.length} imagen(es) no cargaron: ${broken.map((b) => b.src).join(", ")}`);
  }

  const outPath = path.join(ROOT, pdf);
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "16mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `
      <div style="font-size:8px;color:#7A6358;width:100%;text-align:center;font-family:Arial,sans-serif;">
        Nómina Xpress · <span class="pageNumber"></span>/<span class="totalPages"></span>
      </div>`,
  });
  await page.close();
  await unlink(tmpHtmlPath);

  const { size } = await stat(outPath);
  console.log(`✓ ${pdf} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}

async function main() {
  const browser = await chromium.launch();
  for (const doc of DOCS) {
    await buildOne(browser, doc);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
