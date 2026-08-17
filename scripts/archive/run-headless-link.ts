import { chromium } from "playwright";
import http from "node:http";
import { readFileSync } from "node:fs";

const server = http.createServer((req, res) => {
  const p = req.url === "/book.b64" ? "<PROJECT_ROOT>/hltest/book.b64"
    : req.url === "/link.js" ? "<PROJECT_ROOT>/hltest/link.js"
    : req.url === "/dejavu.ttf" ? "<PROJECT_ROOT>/hltest/dejavu.ttf"
    : "<PROJECT_ROOT>/hltest/link.html";
  try {
    const data = readFileSync(p);
    res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".b64") ? "text/plain" : "text/html" });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise<void>((r) => server.listen(8088, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8088/link.html");
await page.waitForFunction(() => (document.getElementById("out")?.textContent ?? "").includes("DONE"), null, { timeout: 120000 });
console.log(await page.textContent("#out"));
await browser.close();
server.close();
