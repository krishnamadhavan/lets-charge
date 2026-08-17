#!/usr/bin/env node
// Lab webhook sink for CitrineOS subscriptions. Prints each POST body.

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3456);
const chunks = [];

const server = http.createServer((req, res) => {
  const parts = [];
  req.on('data', (c) => parts.push(c));
  req.on('end', () => {
    const body = Buffer.concat(parts).toString('utf8');
    const ts = new Date().toISOString();
    console.log('---', ts, req.method, req.url);
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body);
    }
    chunks.push(body);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`sink listening on :${PORT}`);
});
