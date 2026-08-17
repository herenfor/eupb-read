import { chromium } from "playwright";
import http from "node:http";
import { readFileSync } from "node:fs";

const server = http.createServer((req, res) => {
  const p = req.url === "/book.b64" ? "<PROJECT_ROOT>/hltest/book.b64"
    : req.url === "/sticky.js" ? "<PROJECT_ROOT>/hltest/sticky.js"
    : req.url === "/dejavu.ttf" ? "<PROJECT_ROOT>/hltest/dejavu.ttf"
    : "<PROJECT_ROOT>/hltest/sticky.html";
  try {
    const data = readFileSync(p);
    res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".b64") ? "text/plain" : "text/html" });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise<void>((r) => server.listen(8084, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
await page.goto("http://127.0.0.1:8084/sticky.html");
await page.waitForFunction(() => (document.getElementById("out")?.textContent ?? "").includes("DONE"), null, { timeout: 120000 });
console.log(await page.textContent("#out"));
await browser.close();
server.close();
