// 의존성 없는 정적 서버. 같은 와이파이의 휴대폰에서도 접속할 수 있게 0.0.0.0에 연다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = +process.env.PORT || 5173;
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(normalize(root))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': (types[extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`갈피: http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`휴대폰에서: http://${a.address}:${port}`);
  }
});
