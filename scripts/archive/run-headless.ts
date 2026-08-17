import { chromium } from "playwright";
import http from "node:http";
import { readFileSync } from "node:fs";

const server = http.createServer((req, res) => {
  const p = req.url === "/book.b64" ? "<PROJECT_ROOT>/hltest/book.b64"
    : req.url === "/entry.js" ? "<PROJECT_ROOT>/hltest/entry.js"
    : "<PROJECT_ROOT>/hltest/test.html";
  try {
    const data = readFileSync(p);
    res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".b64") ? "text/plain" : "text/html" });
    res.end(data);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise<void>((r) => server.listen(8099, "127.0.0.1", r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto("http://127.0.0.1:8099/test.html");
await page.waitForFunction(
  () => (document.getElementById("out")?.textContent ?? "").includes("DONE"),
  null,
  { timeout: 600000 }
);
const out = await page.textContent("#out");
console.log(out);
await browser.close();
server.close();
