import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { handler } from './handler.mjs';

const port = Number(process.env.PORT || 3000);
process.env.DAILY_PHRASE_LOCAL = '1';
createServer(async (req, res) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(chunk);
  }
  const result = await handler({
    httpMethod: req.method,
    path: new URL(req.url, `http://${req.headers.host}`).pathname,
    headers: req.headers,
    body: Buffer.concat(chunks).toString('utf8') || undefined,
    requestContext: { requestId: randomUUID() },
  });
  res.writeHead(result.statusCode, result.headers).end(result.body);
}).listen(port, '127.0.0.1', () =>
  console.log(`Daily Phrase local API listening on http://127.0.0.1:${port}`),
);
