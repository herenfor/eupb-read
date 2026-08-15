import { chromium } from "playwright";
import http from "node:http";
import { readFileSync } from "node:fs";

const server = http.createServer((req, res) => {
  const p = req.url === "/book.b64" ? "/home/herenfor/test/hltest/book.b64"
    : req.url === "/dump3.js" ? "/home/herenfor/test/hltest/dump3.js"
    : "/home/herenfor/test/hltest/dump3.html";
  try {
    const data = readFileSync(p);
    res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".b64") ? "text/plain" : "text/html" });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise<void>((r) => server.listen(8096, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8096/dump3.html");
await page.waitForFunction(() => (document.getElementById("out")?.textContent ?? "").includes("DONE"), null, { timeout: 120000 });
console.log(await page.textContent("#out"));
await browser.close();
server.close();
