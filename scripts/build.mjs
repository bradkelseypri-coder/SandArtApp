// Bundles the game into single self-contained HTML files:
//   dist/index.html     a normal web page, open it anywhere
//   dist/artifact.html  the same page as a fragment for hosts that add their own <html> shell
// `--serve` also serves dist/ on http://localhost:5173
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">';

async function bundle(embedded) {
  const out = await build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    write: false,
    define: { __EMBEDDED__: String(embedded) },
  });
  return out.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
}

const css = await readFile("src/styles.css", "utf8");
const body = await readFile("src/app.html", "utf8");
const head = `<title>Sand Table</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${FONTS}\n<style>\n${css}</style>`;

await mkdir("dist", { recursive: true });
await writeFile("dist/artifact.html", `${head}\n${body}<script>${await bundle(true)}</script>\n`);
await writeFile(
  "dist/index.html",
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}<script>${await bundle(false)}</script>
</body>
</html>
`,
);
console.log("built dist/index.html and dist/artifact.html");

if (process.argv.includes("--serve")) {
  createServer(async (_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile("dist/index.html"));
  }).listen(5173, () => console.log("playing at http://localhost:5173"));
}
