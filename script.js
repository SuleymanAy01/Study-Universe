document.addEventListener('DOMContentLoaded', () => {
  const THEME_KEY = 'study-universe-theme';

  const state = {
    books: [],
    filter: 'all',
    search: '',
    sort: 'latest',
    adminUnlocked: false,
    needsSetup: false,
    editingId: null
  };

  initTheme();
  initNavigation();
  initAdminMode();
  initBooksPage();
  initScrollTop();
  initBookmarkCatcher();
  initData();

  async function initData() {
    await refreshSession();
    await loadBooks();
    renderBooks();
    renderRecentBooks();
    syncAdminUi();
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    setTheme(saved || (prefersDark ? 'dark' : 'light'));

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        setTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
      });
    });
  }

  function setTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }

  function initNavigation() {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === current);
    });
  }

  function initAdminMode() {
    const adminToggle = document.querySelector('[data-admin-toggle]');
    if (!adminToggle) return;

    adminToggle.addEventListener('click', async () => {
      if (state.adminUnlocked) {
        await api('/api/logout', { method: 'POST' });
        state.adminUnlocked = false;
        syncAdminUi();
        renderBooks();
        return;
      }

      const success = state.needsSetup ? await setupAdminPassword() : await loginAdmin();
      if (!success) return;

      await refreshSession();
      syncAdminUi();
      renderBooks();
    });
  }

  async function setupAdminPassword() {
    const firstPassword = window.prompt('Yeni yönetici şifreni belirle (en az 6 karakter):');
    if (firstPassword === null) return false;
    if (firstPassword.trim().length < 6) {
      window.alert('Şifre en az 6 karakter olmalı.');
      return false;
    }

    const secondPassword = window.prompt('Şifreni tekrar gir:');
    if (secondPassword === null) return false;
    if (firstPassword !== secondPassword) {
      window.alert('Şifreler eşleşmedi.');
      return false;
    }

    try {
      await api('/api/setup', {
        method: 'POST',
        body: { password: firstPassword }
      });
      window.alert('Yönetici şifresi oluşturuldu.');
      return true;
    } catch (error) {
      window.alert(error.message);
      return false;
    }
  }

  async function loginAdmin() {
    const password = window.prompt('Yönetici şifresini gir:');
    if (password === null) return false;

    try {
      await api('/api/login', {
        method: 'POST',
        body: { password }
      });
      return true;
    } catch (error) {
      window.alert(error.message);
      return false;
    }
  }

  async function refreshSession() {
    const session = await api('/api/session');
    state.adminUnlocked = Boolean(session.authenticated);
    state.needsSetup = Boolean(session.needsSetup);
  }

  function syncAdminUi() {
    const adminToggle = document.querySelector('[data-admin-toggle]');
    const adminPanel = document.getElementById('adminPanel');

    document.body.classList.toggle('admin-mode', state.adminUnlocked);
    if (adminPanel) adminPanel.hidden = !state.adminUnlocked;

    if (adminToggle) {
      adminToggle.textContent = state.adminUnlocked
        ? 'Yönetici Çıkışı'
        : state.needsSetup
          ? 'Yönetici Şifresi Oluştur'
          : 'Yönetici Girişi';
    }
  }

  function initBooksPage() {
    const bookList = document.getElementById('bookList');
    const form = document.getElementById('bookForm');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');

    if (!bookList) return;

    searchInput?.addEventListener('input', () => {
      state.search = searchInput.value;
      renderBooks();
    });

    sortSelect?.addEventListener('change', () => {
      state.sort = sortSelect.value;
      renderBooks();
    });

    document.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.filter = button.dataset.filter || 'all';
        document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        renderBooks();
      });
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const title = document.getElementById('title').value.trim();
      const author = document.getElementById('author').value.trim();
      const category = document.getElementById('category').value;
      const summary = document.getElementById('desc').value.trim();

      if (!title || !author || !summary) return;

      try {
        if (state.editingId) {
          await api(`/api/books/${encodeURIComponent(state.editingId)}`, {
            method: 'PUT',
            body: { title, author, category, summary }
          });
          state.editingId = null;
          document.getElementById('submitBook').textContent = 'Kitap Ekle';
        } else {
          await api('/api/books', {
            method: 'POST',
            body: { title, author, category, summary }
          });
        }

        form.reset();
        await loadBooks();
        renderBooks();
        renderRecentBooks();
      } catch (error) {
        window.alert(error.message);
      }
    });

    bookList.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button || !state.adminUnlocked) return;

      const card = button.closest('[data-book-id]');
      const book = state.books.find((item) => item.id === card?.dataset.bookId);
      if (!book) return;

      if (button.dataset.action === 'delete') {
        if (!window.confirm(`"${book.title}" kitabı silinsin mi?`)) return;

        try {
          await api(`/api/books/${encodeURIComponent(book.id)}`, { method: 'DELETE' });
          await loadBooks();
          renderBooks();
          renderRecentBooks();
        } catch (error) {
          window.alert(error.message);
        }
      }

      if (button.dataset.action === 'edit') {
        state.editingId = book.id;
        document.getElementById('title').value = book.title;
        document.getElementById('author').value = book.author;
        document.getElementById('category').value = book.category;
        document.getElementById('desc').value = book.summary;
        document.getElementById('submitBook').textContent = 'Güncelle';
        document.getElementById('title').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  async function loadBooks() {
    state.books = await api('/api/books');
  }

  function renderBooks() {
    const bookList = document.getElementById('bookList');
    const bookCount = document.getElementById('bookCount');
    const emptyState = document.getElementById('emptyState');
    if (!bookList) return;

    const search = state.search.trim().toLocaleLowerCase('tr-TR');
    let books = state.books.filter((book) => {
      const matchesFilter = state.filter === 'all' || book.category === state.filter;
      const searchable = `${book.title} ${book.author} ${book.category} ${book.summary}`.toLocaleLowerCase('tr-TR');
      return matchesFilter && (!search || searchable.includes(search));
    });

    books = books.sort((a, b) => {
      if (state.sort === 'oldest') return a.createdAt - b.createdAt;
      if (state.sort === 'title') return a.title.localeCompare(b.title, 'tr');
      return b.createdAt - a.createdAt;
    });

    bookList.innerHTML = books.map((book) => createBookCard(book, true)).join('');
    if (bookCount) bookCount.textContent = String(books.length);
    if (emptyState) emptyState.hidden = books.length > 0;
  }

  function renderRecentBooks() {
    const recentList = document.getElementById('recentBooksList');
    const recentCount = document.getElementById('recentBooksCount');
    const recentEmpty = document.getElementById('recentBooksEmpty');
    if (!recentList) return;

    const recent = [...state.books].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
    recentList.innerHTML = recent.map((book) => createBookCard(book, false)).join('');
    if (recentCount) recentCount.textContent = String(recent.length);
    if (recentEmpty) recentEmpty.hidden = recent.length > 0;
  }

  function createBookCard(book, allowActions) {
    const actions = allowActions && state.adminUnlocked
      ? `<div class="book-actions">
          <button class="icon-button" type="button" data-action="edit" aria-label="Kitabı düzenle">✎</button>
          <button class="icon-button danger" type="button" data-action="delete" aria-label="Kitabı sil">×</button>
        </div>`
      : '';

    return `
      <article class="book-card" data-book-id="${escapeHtml(book.id)}">
        <div class="book-topline">
          <span class="tag">${escapeHtml(book.category)}</span>
          ${actions}
        </div>
        <div class="book-icon">${escapeHtml(book.title.slice(0, 1).toLocaleUpperCase('tr-TR') || 'K')}</div>
        <h3>${escapeHtml(book.title)}</h3>
        <p class="author">${escapeHtml(book.author)}</p>
        <p class="book-summary">${escapeHtml(book.summary || 'Özet eklenmemiş.')}</p>
      </article>
    `;
  }

  async function api(url, options = {}) {
    let response;

    try {
      response = await fetch(url, {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch {
      throw new Error('Sunucuya bağlanılamadı. start.bat penceresi açık mı ve site http://localhost:3000 üzerinden mi açıldı?');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.');
    return data;
  }

  function initScrollTop() {
    const button = document.querySelector('.scroll-top');
    if (!button) return;

    const update = () => button.classList.toggle('visible', window.scrollY > 320);
    window.addEventListener('scroll', update, { passive: true });
    update();
    button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function initBookmarkCatcher() {
    const canvas = document.getElementById('bookmarkCanvas');
    const scoreEl = document.getElementById('bookmarkScore');
    const livesEl = document.getElementById('bookmarkLives');
    const badgeEl = document.getElementById('bookmarkScoreBadge');
    const restartBtn = document.getElementById('bookmarkRestart');
    if (!canvas || !scoreEl || !livesEl || !badgeEl || !restartBtn) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const player = { x: W / 2 - 55, y: H - 34, w: 110, h: 18, targetX: W / 2 - 55 };
    const keys = { left: false, right: false };
    let game;

    function reset() {
      game = { score: 0, lives: 3, running: true, items: [], last: 0, spawn: 0, delay: 850 };
      player.x = W / 2 - player.w / 2;
      player.targetX = player.x;
      syncHud();
      requestAnimationFrame(loop);
    }

    function syncHud() {
      scoreEl.textContent = String(game.score);
      livesEl.textContent = String(game.lives);
      badgeEl.textContent = `${game.score} puan`;
    }

    function spawnItem() {
      const bomb = Math.random() < 0.22;
      game.items.push({
        x: 24 + Math.random() * (W - 48),
        y: -18,
        r: 15,
        speed: 2.4 + Math.random() * 1.5,
        color: bomb ? '#111827' : ['#5361f4', '#e0528d', '#2fa66a', '#eea83b'][Math.floor(Math.random() * 4)],
        bomb
      });
    }

    function loop(time) {
      const dt = Math.min(32, time - game.last || 16);
      game.last = time;

      if (game.running) {
        game.spawn += dt;
        if (game.spawn > game.delay) {
          game.spawn = 0;
          game.delay = Math.max(410, game.delay - 10);
          spawnItem();
        }

        if (keys.left) player.targetX -= 8;
        if (keys.right) player.targetX += 8;
        player.targetX = clamp(player.targetX, 0, W - player.w);
        player.x += (player.targetX - player.x) * 0.22;

        game.items.forEach((item) => { item.y += item.speed; });
        game.items = game.items.filter((item) => {
          const hit = item.x > player.x - 12 && item.x < player.x + player.w + 12 && item.y + item.r > player.y;
          if (hit) {
            game.score += item.bomb ? 0 : 1;
            game.lives -= item.bomb ? 1 : 0;
            syncHud();
            return false;
          }
          if (item.y - item.r > H) {
            if (!item.bomb) game.lives -= 1;
            syncHud();
            return false;
          }
          return true;
        });

        if (game.lives <= 0) game.running = false;
      }

      draw();
      if (game.running) requestAnimationFrame(loop);
    }

    function draw() {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#eef2ff');
      grad.addColorStop(1, '#fff1f6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#202637';
      roundRect(player.x, player.y, player.w, player.h, 10);
      ctx.fill();

      game.items.forEach((item) => {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.fillStyle = item.color;
        if (item.bomb) {
          ctx.beginPath();
          ctx.arc(0, 0, item.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 18px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', 0, 1);
        } else {
          roundRect(-10, -16, 20, 32, 6);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          ctx.beginPath();
          ctx.moveTo(-6, -8);
          ctx.lineTo(0, 0);
          ctx.lineTo(6, -8);
          ctx.lineTo(6, 11);
          ctx.lineTo(-6, 11);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });

      if (!game.running) {
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#202637';
        ctx.font = '800 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Oyun Bitti', W / 2, H / 2 - 8);
        ctx.font = '500 16px sans-serif';
        ctx.fillText('Yeniden Başlat butonuna basabilirsin.', W / 2, H / 2 + 22);
      }
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    }

    restartBtn.addEventListener('click', reset);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') keys.left = true;
      if (event.key === 'ArrowRight') keys.right = true;
    });
    window.addEventListener('keyup', (event) => {
      if (event.key === 'ArrowLeft') keys.left = false;
      if (event.key === 'ArrowRight') keys.right = false;
    });

    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = W / rect.width;
      player.targetX = clamp((event.clientX - rect.left) * ratio - player.w / 2, 0, W - player.w);
    });

    reset();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
});
