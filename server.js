const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL || '';
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

const store = DATABASE_URL ? createPostgresStore() : createJsonStore();

start();

async function start() {
  await store.init();

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
    const mode = DATABASE_URL ? 'PostgreSQL' : 'JSON';
    console.log(`Study Universe calisiyor: http://localhost:${PORT} (${mode})`);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/session') {
    sendJson(res, 200, {
      authenticated: isAuthenticated(req),
      needsSetup: !(await store.adminExists())
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/setup') {
    if (await store.adminExists()) {
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

    await store.saveAdminPassword(passwordHash(password));
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
    const admin = await store.readAdminPassword();

    if (!admin || !verifyAdminPassword(password, admin)) {
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
    sendJson(res, 200, await store.readBooks());
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

    const created = await store.createBook(book);
    sendJson(res, 201, created);
    return;
  }

  const bookMatch = url.pathname.match(/^\/api\/books\/([^/]+)$/);
  if (bookMatch && req.method === 'PUT') {
    requireAdmin(req, res);
    if (res.writableEnded) return;

    const input = await readJsonSafely(req, res);
    if (!input) return;

    const updated = await store.updateBook(bookMatch[1], normalizeBook(input));
    if (!updated) {
      sendJson(res, 404, { error: 'Kitap bulunamadi.' });
      return;
    }

    sendJson(res, 200, updated);
    return;
  }

  if (bookMatch && req.method === 'DELETE') {
    requireAdmin(req, res);
    if (res.writableEnded) return;

    await store.deleteBook(bookMatch[1]);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'API yolu bulunamadi.' });
}

function createPostgresStore() {
  let Pool;

  try {
    ({ Pool } = require('pg'));
  } catch {
    throw new Error('DATABASE_URL ayarli ama pg paketi yok. Render build komutunda npm install calismali.');
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : undefined
  });

  return {
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          salt TEXT NOT NULL,
          hash TEXT NOT NULL,
          iterations INTEGER NOT NULL,
          digest TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT one_admin_row CHECK (id = 1)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS books (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          author TEXT NOT NULL,
          category TEXT NOT NULL,
          summary TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `);

      const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM books');
      if (countResult.rows[0].count === 0) {
        for (const book of starterBooks) {
          await pool.query(
            'INSERT INTO books (id, title, author, category, summary, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [book.id, book.title, book.author, book.category, book.summary, book.createdAt]
          );
        }
      }
    },

    async adminExists() {
      const result = await pool.query('SELECT 1 FROM admin_settings WHERE id = 1');
      return result.rowCount > 0;
    },

    async saveAdminPassword(admin) {
      await pool.query(
        `INSERT INTO admin_settings (id, salt, hash, iterations, digest)
         VALUES (1, $1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET salt = EXCLUDED.salt, hash = EXCLUDED.hash,
         iterations = EXCLUDED.iterations, digest = EXCLUDED.digest`,
        [admin.salt, admin.hash, admin.iterations, admin.digest]
      );
    },

    async readAdminPassword() {
      const result = await pool.query('SELECT salt, hash, iterations, digest FROM admin_settings WHERE id = 1');
      return result.rows[0] || null;
    },

    async readBooks() {
      const result = await pool.query(
        'SELECT id, title, author, category, summary, created_at AS "createdAt" FROM books ORDER BY created_at DESC'
      );
      return result.rows.map((book) => ({ ...book, createdAt: Number(book.createdAt) }));
    },

    async createBook(book) {
      const created = { ...book, id: crypto.randomUUID(), createdAt: Date.now() };
      await pool.query(
        'INSERT INTO books (id, title, author, category, summary, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [created.id, created.title, created.author, created.category, created.summary, created.createdAt]
      );
      return created;
    },

    async updateBook(id, book) {
      const result = await pool.query(
        `UPDATE books SET title = $2, author = $3, category = $4, summary = $5
         WHERE id = $1 RETURNING id, title, author, category, summary, created_at AS "createdAt"`,
        [id, book.title, book.author, book.category, book.summary]
      );
      const updated = result.rows[0];
      return updated ? { ...updated, createdAt: Number(updated.createdAt) } : null;
    },

    async deleteBook(id) {
      await pool.query('DELETE FROM books WHERE id = $1', [id]);
    }
  };
}

function createJsonStore() {
  return {
    async init() {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      if (!fs.existsSync(BOOKS_FILE)) writeJson(BOOKS_FILE, starterBooks);
    },

    async adminExists() {
      return fs.existsSync(ADMIN_FILE);
    },

    async saveAdminPassword(admin) {
      writeJson(ADMIN_FILE, admin);
    },

    async readAdminPassword() {
      return readJsonFile(ADMIN_FILE, null);
    },

    async readBooks() {
      return readJsonFile(BOOKS_FILE, starterBooks);
    },

    async createBook(book) {
      const books = await this.readBooks();
      const created = { ...book, id: crypto.randomUUID(), createdAt: Date.now() };
      books.unshift(created);
      writeJson(BOOKS_FILE, books);
      return created;
    },

    async updateBook(id, book) {
      const books = await this.readBooks();
      const index = books.findIndex((item) => item.id === id);
      if (index === -1) return null;

      books[index] = { ...books[index], ...book };
      writeJson(BOOKS_FILE, books);
      return books[index];
    },

    async deleteBook(id) {
      const books = await this.readBooks();
      writeJson(BOOKS_FILE, books.filter((book) => book.id !== id));
    }
  };
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

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 310000;
  const digest = 'sha256';
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, digest).toString('hex');
  return { salt, hash, iterations, digest };
}

function verifyAdminPassword(password, admin) {
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

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
