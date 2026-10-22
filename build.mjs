import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { transformSync } from "esbuild";
const MIN = !process.argv.includes("--dev");

const schema = readFileSync("src/schema.sql", "utf8");
let js = readFileSync("src/app.js", "utf8");
if (MIN) js = transformSync(js, { minify: true, target: "es2020", charset: "utf8" }).code;
if (/<\/script/i.test(js)) throw new Error("app.js contiene </script>");
let html = readFileSync("src/app.html", "utf8").replace("__APP_JS__", () => js);
const versionOfHtml = createHash("sha256").update(html).digest("hex").slice(0, 12);
html = html.replace("__APP_VERSION__", versionOfHtml);
const version = versionOfHtml;
const server = readFileSync("src/server.js", "utf8")
  .replace("__APP_VERSION__", () => JSON.stringify(version))
  .replace("__SCHEMA__", () => JSON.stringify(schema))
  .replace("__APP_HTML__", () => JSON.stringify(html));
mkdirSync("dist", { recursive: true });
const out = MIN ? transformSync(server, { minify: true, format: "esm", target: "es2022", charset: "utf8" }).code : server;
writeFileSync("dist/worker.js", out);
console.log("dist/worker.js", (out.length / 1024).toFixed(1) + " KB", "sha256", createHash("sha256").update(out).digest("hex").slice(0, 16));
