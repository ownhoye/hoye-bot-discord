// LoliCord - serveur de chat temps réel (sans dépendances)
// Texte via POST + Server-Sent Events, présence vocale simulée.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 2500;
const PUBLIC_DIR = path.join(__dirname, 'public');
const HISTORY_LIMIT = 200;

const server_info = {
  name: '25時、LoliCordで。',
  channels: [
    { id: 'general', name: 'général', type: 'text' },
    { id: 'musique', name: 'musique', type: 'text' },
    { id: 'off-topic', name: 'off-topic', type: 'text' },
    { id: 'vc', name: 'Salon vocal', type: 'voice' },
  ],
};

const history = Object.fromEntries(
  server_info.channels.filter((c) => c.type === 'text').map((c) => [c.id, []])
);

// token -> { id, name, color, inVoice, muted, clients:Set<res> }
const users = new Map();

const COLORS = ['#8888cc', '#bb6688', '#ccaa88', '#ddaacc', '#7fb3d5', '#a3d9a5', '#f5b971'];

function publicUser(u) {
  return { id: u.id, name: u.name, color: u.color, inVoice: u.inVoice, muted: u.muted };
}

function onlineUsers() {
  return [...users.values()].filter((u) => u.clients.size > 0).map(publicUser);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const u of users.values()) for (const res of u.clients) res.write(payload);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function cleanName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'interdit' });
  fs.readFile(file, (err, content) => {
    if (err) return sendJson(res, 404, { error: 'introuvable' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}

async function handleApi(req, res, pathname) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: 'JSON invalide' });
  }

  if (pathname === '/api/login') {
    const name = cleanName(body.name);
    if (!name) return sendJson(res, 400, { error: 'Pseudo requis' });
    const token = crypto.randomBytes(16).toString('hex');
    users.set(token, {
      id: crypto.randomBytes(6).toString('hex'),
      name,
      color: COLORS[users.size % COLORS.length],
      inVoice: false,
      muted: false,
      clients: new Set(),
    });
    return sendJson(res, 200, { token, user: publicUser(users.get(token)) });
  }

  const user = users.get(body.token);
  if (!user) return sendJson(res, 401, { error: 'Session invalide' });

  if (pathname === '/api/message') {
    const list = history[body.channel];
    const text = String(body.text || '').trim().slice(0, 2000);
    if (!list) return sendJson(res, 404, { error: 'Salon inconnu' });
    if (!text) return sendJson(res, 400, { error: 'Message vide' });
    const msg = {
      id: crypto.randomBytes(8).toString('hex'),
      channel: body.channel,
      author: publicUser(user),
      text,
      time: Date.now(),
    };
    list.push(msg);
    if (list.length > HISTORY_LIMIT) list.shift();
    broadcast('message', msg);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/voice') {
    if (typeof body.inVoice === 'boolean') user.inVoice = body.inVoice;
    if (typeof body.muted === 'boolean') user.muted = body.muted;
    broadcast('presence', onlineUsers());
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: 'Route inconnue' });
}

function handleEvents(req, res) {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const user = users.get(token);
  if (!user) return sendJson(res, 401, { error: 'Session invalide' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  user.clients.add(res);
  res.write(`event: init\ndata: ${JSON.stringify({ server: server_info, history, me: publicUser(user) })}\n\n`);
  broadcast('presence', onlineUsers());

  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    user.clients.delete(res);
    if (user.clients.size === 0) user.inVoice = false;
    broadcast('presence', onlineUsers());
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/events' && req.method === 'GET') return handleEvents(req, res);
  if (pathname.startsWith('/api/') && req.method === 'POST') return handleApi(req, res, pathname);
  if (req.method === 'GET') return serveStatic(req, res);
  sendJson(res, 405, { error: 'Méthode non autorisée' });
});

server.listen(PORT, () => {
  console.log(`LoliCord en ligne sur http://localhost:${PORT}`);
});
