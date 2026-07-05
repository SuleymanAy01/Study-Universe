const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const LOGIN_WINDOW_MS = 1000 * 60 * 15;
const MAX_LOGIN_ATTEMPTS = 5;

const ROOT = __dirname;
const PUBLIC_DIR = fs.existsSync(path.join(ROOT, 'public')) ? path.join(ROOT, 'public') : ROOT;
const DATA_DIR = path.join(ROOT, 'data');
const BOOKS_FILE = path.join(DATA_DIR, 'books.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

const sessions = new Map();
const loginAttempts = new Map();

const starterBooks = [
  {
    id: crypto.randomUUID(),
    title: 'Kurk Mantolu Madonna',
    author: 'Sabahattin Ali',
    category: 'Roman',
    summary: 'Yalnizlik, ic dunya ve ask uzerine dokunakli bir roman.',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4
  },
  {
    id: crypto.randomUUID(),
    title: 'Atomik Aliskanliklar',
    author: 'James Clear',
    category: 'Kisisel Gelisim',
    summary: 'Kucuk aliskanliklarin buyuk degisimlere etkisini anlatir.',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3
  },
  {
    id: crypto.randomUUID(),
    title: 'Simyaci',
    author: 'Paulo Coelho',
    category: 'Felsefe',
    summary: 'Kendi yolunu bulma ve isaretleri okuma uzerine simgesel bir hikaye.',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2
  },
  {
    id: crypto.randomUUID(),
    title: 'Zamanin Kisa Tarihi',
    author: 'Stephen Hawking',
    category: 'Bilim',
    summary: 'Evrenin yapisini anlasilir bir dille anlatan klasik bilim kitabi.',
    createdAt: Date.now() - 1000 * 60 * 60 * 24
  }
];

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      await handleApi(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'Sunucu hatasi.' });
  }
});

server.listen(PORT, () => {
  console.log(`Study Universe calisiyor: http://localhost:${PORT}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/session') {
    sendJson(res, 200, {
      authenticated: isAuthenticated(req),
      needsSetup: !adminExists()
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/setup') {
    if (adminExists()) {
      sendJson(res, 409, { error: 'Yonetici sifresi zaten olusturulmus.' });
      return;
    }

    const body = await readJsonSafely(req, res);
    if (!body) return;

    const password = String(body.password || '');
    if (!isStrongPassword(password)) {
      sendJson(res, 400, { error: 'Sifre en az 10 karakter olmali ve harf ile rakam icermeli.' });
      return;
    }

    saveAdminPassword(password);
    createSession(req, res);
    sendJson(res, 201, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (isRateLimited(req)) {
      sendJson(res, 429, { error: 'Cok fazla hatali deneme yapildi. 15 dakika sonra tekrar dene.' });
      return;
    }

    const body = await readJsonSafely(req, res);
    if (!body) return;

    const password = String(body.password || '');
    if (!adminExists() || !verifyAdminPassword(password)) {
      recordFailedLogin(req);
      sendJson(res, 401, { error: 'Sifre yanlis.' });
      return;
    }

    clearFailedLogins(req);
    createSession(req, res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const sessionId = getCookie(req, 'su_session');
    if (sessionId) sessions.delete(sessionId);
    clearSession(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/books') {
    sendJson(res, 200, readBooks());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/books') {
    requireAdmin(req, res);
    if (res.writableEnded) return;

    const input = await readJsonSafely(req, res);
    if (!input) return;

    const book = normalizeBook(input);
    if (!book.title || !book.author || !book.summary) {
      sendJson(res, 400, { error: 'Kitap adi, yazar ve ozet gerekli.' });
      return;
    }

    const books = readBooks();
    books.unshift({ ...book, id: crypto.randomUUID(), createdAt: Date.now() });
    writeBooks(books);
    sendJson(res, 201, books[0]);
    return;
  }

  const bookMatch = url.pathname.match(/^\/api\/books\/([^/]+)$/);
  if (bookMatch && req.method === 'PUT') {
    requireAdmin(req, res);
    if (res.writableEnded) return;

    const input = await readJsonSafely(req, res);
    if (!input) return;

    const next = normalizeBook(input);
    const books = readBooks();
    const index = books.findIndex((book) => book.id === bookMatch[1]);

    if (index === -1) {
      sendJson(res, 404, { error: 'Kitap bulunamadi.' });
      return;
    }

    books[index] = { ...books[index], ...next };
    writeBooks(books);
    sendJson(res, 200, books[index]);
    return;
  }

  if (bookMatch && req.method === 'DELETE') {
    requireAdmin(req, res);
    if (res.writableEnded) return;

    const books = readBooks();
    writeBooks(books.filter((book) => book.id !== bookMatch[1]));
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'API yolu bulunamadi.' });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, securityHeaders());
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, securityHeaders());
      res.end('Not found');
      return;
    }

    res.writeHead(200, securityHeaders({ 'Content-Type': contentType(filePath) }));
    res.end(data);
  });
}

function requireAdmin(req, res) {
  if (!isAuthenticated(req)) {
    sendJson(res, 401, { error: 'Yonetici girisi gerekli.' });
  }
}

function isAuthenticated(req) {
  const sessionId = getCookie(req, 'su_session');
  if (!sessionId) return false;

  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return false;
  }

  return true;
}

function createSession(req, res) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, { expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', cookieHeader(req, 'su_session', sessionId, Math.floor(SESSION_TTL_MS / 1000)));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', 'su_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function cookieHeader(req, name, value, maxAge) {
  const secure = IS_PRODUCTION || req.headers['x-forwarded-proto'] === 'https';
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  return header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function adminExists() {
  return fs.existsSync(ADMIN_FILE);
}

function saveAdminPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
  writeJson(ADMIN_FILE, { salt, hash, iterations: 310000, digest: 'sha256' });
}

function verifyAdminPassword(password) {
  const admin = readJsonFile(ADMIN_FILE, null);
  if (!admin) return false;

  const hash = crypto.pbkdf2Sync(password, admin.salt, admin.iterations, 32, admin.digest).toString('hex');
  const expected = Buffer.from(admin.hash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

function isStrongPassword(password) {
  return password.trim().length >= 10 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

function getClientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(req) {
  const key = getClientKey(req);
  const attempt = loginAttempts.get(key);
  if (!attempt) return false;

  if (Date.now() - attempt.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }

  return attempt.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt || now - attempt.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return;
  }

  attempt.count += 1;
}

function clearFailedLogins(req) {
  loginAttempts.delete(getClientKey(req));
}

function normalizeBook(input) {
  return {
    title: String(input.title || '').trim(),
    author: String(input.author || '').trim(),
    category: String(input.category || 'Genel').trim(),
    summary: String(input.summary || '').trim()
  };
}

function readBooks() {
  return readJsonFile(BOOKS_FILE, starterBooks);
}

function writeBooks(books) {
  writeJson(BOOKS_FILE, books);
}

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BOOKS_FILE)) writeBooks(starterBooks);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

async function readJsonSafely(req, res) {
  try {
    return await readJson(req);
  } catch {
    sendJson(res, 400, { error: 'Gecersiz JSON verisi.' });
    return null;
  }
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, securityHeaders({ 'Content-Type': 'application/json; charset=utf-8' }));
  res.end(JSON.stringify(value));
}

function securityHeaders(headers = {}) {
  return {
    ...headers,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-store'
  };
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  }[ext] || 'application/octet-stream';
}
