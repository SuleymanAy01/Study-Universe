document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const STORAGE_KEY = 'study-universe-books';
  const THEME_KEY = 'study-universe-theme';
  const ADMIN_PASSWORD = window.STUDY_UNIVERSE_CONFIG?.adminPassword || '';

  const starterBooks = [
    {
      id: cryptoRandomId(),
      title: 'Kürk Mantolu Madonna',
      author: 'Sabahattin Ali',
      category: 'Roman',
      summary: 'Yalnızlık, iç dünya ve aşk üzerine dokunaklı bir roman.',
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4
    },
    {
      id: cryptoRandomId(),
      title: 'Atomik Alışkanlıklar',
      author: 'James Clear',
      category: 'Kişisel Gelişim',
      summary: 'Küçük alışkanlıkların büyük değişimlere etkisini anlatır.',
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3
    },
    {
      id: cryptoRandomId(),
      title: 'Simyacı',
      author: 'Paulo Coelho',
      category: 'Felsefe',
      summary: 'Kendi yolunu bulma ve işaretleri okuma üzerine simgesel bir hikâye.',
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2
    },
    {
      id: cryptoRandomId(),
      title: 'Zamanın Kısa Tarihi',
      author: 'Stephen Hawking',
      category: 'Bilim',
      summary: 'Evrenin yapısını anlaşılır bir dille anlatan klasik bilim kitabı.',
      createdAt: Date.now() - 1000 * 60 * 60 * 24
    }
  ];

  const state = {
    books: loadBooks(),
    adminUnlocked: false,
    editingId: null
  };

  initTheme();
  initNavigation();
  initAdminMode();
  initBooksPage();
  initIndexPage();
  initScrollTop();

  // Theme
  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(theme);

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTheme = body.classList.contains('dark') ? 'light' : 'dark';
        setTheme(nextTheme);
      });
    });
  }

  function setTheme(theme) {
    body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }

  // Navigation
  function initNavigation() {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('a[href$=".html"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href === current) {
        link.classList.add('active');
      }
    });
  }

  // Admin
  function initAdminMode() {
    const adminToggle = document.querySelector('[data-admin-toggle]');
    const adminPanel = document.getElementById('adminPanel');

    if (!adminToggle || !adminPanel) return;

    syncAdminVisibility();

    adminToggle.addEventListener('click', () => {
      if (state.adminUnlocked) {
        state.adminUnlocked = false;
        syncAdminVisibility();
        renderAllBooks();
        return;
      }

      const entered = window.prompt('Yönetici şifresini gir:');
      if (entered && entered === ADMIN_PASSWORD) {
        state.adminUnlocked = true;
        syncAdminVisibility();
        renderAllBooks();
      } else if (entered !== null) {
        window.alert('Şifre yanlış.');
      }
    });

    function syncAdminVisibility() {
      document.body.classList.toggle('admin-mode', state.adminUnlocked);
      adminPanel.hidden = !state.adminUnlocked;
      adminToggle.textContent = state.adminUnlocked ? 'Yönetici Çıkışı' : 'Yönetici Girişi';
    }
  }

  // Books
  function loadBooks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [...starterBooks];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...starterBooks];
      return parsed.map(normalizeBook).filter(Boolean);
    } catch {
      return [...starterBooks];
    }
  }

  function saveBooks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.books));
  }

  function normalizeBook(book) {
    if (!book || typeof book !== 'object') return null;
    return {
      id: book.id || cryptoRandomId(),
      title: String(book.title || '').trim(),
      author: String(book.author || '').trim(),
      category: String(book.category || 'Genel').trim(),
      summary: String(book.summary || '').trim(),
      createdAt: Number(book.createdAt || Date.now())
    };
  }

  function initBooksPage() {
    const form = document.getElementById('bookForm');
    const searchInput = document.getElementById('bookSearch');
    const categoryFilter = document.getElementById('bookCategoryFilter');
    const sortSelect = document.getElementById('sortSelect');
    const bookList = document.getElementById('bookList');
    const bookCount = document.getElementById('bookCount');
    const emptyState = document.getElementById('emptyState');

    if (!bookList && !document.getElementById('recentBooksList')) return;

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();

        const title = form.querySelector('#bookTitle')?.value?.trim() || '';
        const author = form.querySelector('#bookAuthor')?.value?.trim() || '';
        const category = form.querySelector('#bookCategory')?.value?.trim() || 'Genel';
        const summary = form.querySelector('#bookSummary')?.value?.trim() || '';

        if (!title || !author) return;

        if (state.editingId) {
          const index = state.books.findIndex((book) => book.id === state.editingId);
          if (index !== -1) {
            state.books[index] = {
              ...state.books[index],
              title,
              author,
              category,
              summary
            };
          }
          state.editingId = null;
        } else {
          state.books.unshift({
            id: cryptoRandomId(),
            title,
            author,
            category,
            summary,
            createdAt: Date.now()
          });
        }

        saveBooks();
        form.reset();
        renderAllBooks();
      });
    }

    const refreshFromFilters = () => {
      renderAllBooks({
        search: searchInput?.value || '',
        category: categoryFilter?.value || 'all',
        sortBy: sortSelect?.value || 'newest'
      });
    };

    if (searchInput) searchInput.addEventListener('input', refreshFromFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', refreshFromFilters);
    if (sortSelect) sortSelect.addEventListener('change', refreshFromFilters);

    if (bookList) {
      bookList.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const card = button.closest('[data-book-id]');
        const bookId = card?.dataset.bookId;
        if (!bookId) return;

        const action = button.dataset.action;
        const book = state.books.find((item) => item.id === bookId);
        if (!book) return;

        if (action === 'delete') {
          if (!state.adminUnlocked) return;
          const confirmed = window.confirm(`"${book.title}" kitabı silinsin mi?`);
          if (!confirmed) return;
          state.books = state.books.filter((item) => item.id !== bookId);
          saveBooks();
          renderAllBooks();
        }

        if (action === 'edit') {
          if (!state.adminUnlocked) return;
          state.editingId = bookId;
          form?.querySelector('#bookTitle')?.focus();
          if (form) {
            form.querySelector('#bookTitle').value = book.title;
            form.querySelector('#bookAuthor').value = book.author;
            form.querySelector('#bookCategory').value = book.category;
            form.querySelector('#bookSummary').value = book.summary;
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    renderAllBooks({
      search: searchInput?.value || '',
      category: categoryFilter?.value || 'all',
      sortBy: sortSelect?.value || 'newest'
    });

    if (bookCount) {
      bookCount.textContent = `${state.books.length}`;
    }

    if (emptyState) {
      emptyState.hidden = state.books.length !== 0;
    }
  }

  function renderAllBooks(filters = {}) {
    renderBooksList(filters);
    renderRecentBooks();
    updateBookCount();
  }

  function renderBooksList(filters = {}) {
    const bookList = document.getElementById('bookList');
    const emptyState = document.getElementById('emptyState');
    if (!bookList) return;

    let items = [...state.books];

    const search = String(filters.search || '').trim().toLowerCase();
    const category = String(filters.category || 'all').trim();
    const sortBy = String(filters.sortBy || 'newest');

    if (search) {
      items = items.filter((book) => {
        const haystack = `${book.title} ${book.author} ${book.category} ${book.summary}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    if (category !== 'all') {
      items = items.filter((book) => book.category === category);
    }

    if (sortBy === 'oldest') {
      items.sort((a, b) => a.createdAt - b.createdAt);
    } else if (sortBy === 'title') {
      items.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    } else {
      items.sort((a, b) => b.createdAt - a.createdAt);
    }

    bookList.innerHTML = items.map((book) => createBookCard(book, true)).join('');

    if (emptyState) {
      emptyState.hidden = items.length !== 0;
    }
  }

  function renderRecentBooks() {
    const recentList = document.getElementById('recentBooksList');
    const recentCount = document.getElementById('recentBooksCount');
    const recentEmpty = document.getElementById('recentBooksEmpty');

    if (!recentList) return;

    const recentBooks = [...state.books]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4);

    recentList.innerHTML = recentBooks.map((book) => createBookCard(book, false)).join('');

    if (recentCount) {
      recentCount.textContent = `${recentBooks.length}`;
    }

    if (recentEmpty) {
      recentEmpty.hidden = recentBooks.length !== 0;
    }
  }

  function updateBookCount() {
    const bookCount = document.getElementById('bookCount');
    if (bookCount) {
      bookCount.textContent = `${state.books.length}`;
    }
  }

  function createBookCard(book, allowActions) {
    const initials = book.title.slice(0, 1).toUpperCase() || 'K';
    const canShowActions = allowActions && state.adminUnlocked;

    return `
      <article class="book-card" data-book-id="${escapeHtml(book.id)}">
        <div class="book-card-top">
          <span class="book-category">${escapeHtml(book.category)}</span>
          ${canShowActions ? `
            <div class="book-actions">
              <button class="icon-button" type="button" data-action="edit" aria-label="Kitabı düzenle">✎</button>
              <button class="icon-button danger" type="button" data-action="delete" aria-label="Kitabı sil">🗑</button>
            </div>
          ` : ''}
        </div>

        <div class="book-icon">${escapeHtml(initials)}</div>

        <h3>${escapeHtml(book.title)}</h3>
        <p class="book-author">${escapeHtml(book.author)}</p>
        <p class="book-summary">${escapeHtml(book.summary || 'Özet eklenmemiş.')}</p>
      </article>
    `;
  }

  // Index page book preview only
  function initIndexPage() {
    const recentList = document.getElementById('recentBooksList');
    if (!recentList) return;
    renderRecentBooks();
  }

  // Scroll top
  function initScrollTop() {
    const button = document.querySelector('.scroll-top');
    if (!button) return;

    const updateVisibility = () => {
      button.classList.toggle('visible', window.scrollY > 300);
    };

    window.addEventListener('scroll', updateVisibility, { passive: true });
    updateVisibility();

    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Bookmark Catcher
  initBookmarkCatcher();

  function initBookmarkCatcher() {
    const canvas = document.getElementById('bookmarkCanvas');
    const scoreEl = document.getElementById('bookmarkScore');
    const livesEl = document.getElementById('bookmarkLives');
    const badgeEl = document.getElementById('bookmarkScoreBadge');
    const restartBtn = document.getElementById('bookmarkRestart');

    if (!canvas || !scoreEl || !livesEl || !badgeEl || !restartBtn) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    const game = {
      score: 0,
      lives: 3,
      running: true,
      spawnTimer: 0,
      spawnDelay: 900,
      items: [],
      particles: [],
      lastTime: 0
    };

    const player = {
      x: W / 2 - 50,
      y: H - 34,
      w: 100,
      h: 16,
      targetX: W / 2 - 50
    };

    const keys = { left: false, right: false };

    function syncHud() {
      scoreEl.textContent = String(game.score);
      livesEl.textContent = String(game.lives);
      badgeEl.textContent = `${game.score} puan`;
    }

    function resetGame() {
      game.score = 0;
      game.lives = 3;
      game.running = true;
      game.spawnTimer = 0;
      game.spawnDelay = 900;
      game.items = [];
      game.particles = [];
      game.lastTime = 0;
      player.x = W / 2 - player.w / 2;
      player.targetX = player.x;
      syncHud();
      renderFrame();
      requestAnimationFrame(loop);
    }

    function spawnItem() {
      const variants = [
        { kind: 'bookmark', color: '#6f63ff', speed: 2.6 },
        { kind: 'bookmark', color: '#ff5da2', speed: 2.8 },
        { kind: 'bookmark', color: '#35c46a', speed: 2.5 },
        { kind: 'bomb', color: '#111827', speed: 3.1 }
      ];

      const item = variants[Math.floor(Math.random() * variants.length)];
      game.items.push({
        x: 20 + Math.random() * (W - 40),
        y: -20,
        r: 14,
        vy: item.speed + Math.random() * 1.2,
        color: item.color,
        kind: item.kind,
        wobble: Math.random() * Math.PI * 2
      });
    }

    function burst(x, y, color) {
      for (let i = 0; i < 14; i++) {
        game.particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          life: 1,
          color
        });
      }
    }

    function updatePlayer() {
      const speed = 7.5;

      if (keys.left) player.targetX -= speed;
      if (keys.right) player.targetX += speed;

      player.targetX = clamp(player.targetX, 0, W - player.w);
      player.x += (player.targetX - player.x) * 0.22;
    }

    function updateItems(dt) {
      if (!game.running) return;

      game.spawnTimer += dt;
      if (game.spawnTimer >= game.spawnDelay) {
        game.spawnTimer = 0;
        spawnItem();
        if (game.spawnDelay > 420) {
          game.spawnDelay -= 8;
        }
      }

      for (let i = game.items.length - 1; i >= 0; i--) {
        const item = game.items[i];
        item.y += item.vy;
        item.wobble += 0.06;

        const hit =
          item.x > player.x - 10 &&
          item.x < player.x + player.w + 10 &&
          item.y + item.r > player.y &&
          item.y - item.r < player.y + player.h + 8;

        if (hit) {
          if (item.kind === 'bookmark') {
            game.score += 1;
            burst(item.x, item.y, item.color);
          } else {
            game.lives -= 1;
            burst(item.x, item.y, '#111827');
          }
          game.items.splice(i, 1);
          syncHud();
          continue;
        }

        if (item.y - item.r > H) {
          if (item.kind === 'bookmark') {
            game.lives -= 1;
            syncHud();
          }
          game.items.splice(i, 1);
        }
      }

      if (game.lives <= 0) {
        game.running = false;
      }
    }

    function updateParticles() {
      for (let i = game.particles.length - 1; i >= 0; i--) {
        const p = game.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life -= 0.03;
        if (p.life <= 0) game.particles.splice(i, 1);
      }
    }

    function roundRect(x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    function drawBackground() {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#eef2ff');
      grad.addColorStop(0.5, '#f8fbff');
      grad.addColorStop(1, '#fce7f3');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 16; i++) {
        const x = (i * 83) % W;
        const y = (i * 47) % H;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawPlayer() {
      ctx.save();
      ctx.translate(player.x, player.y);

      const bodyGrad = ctx.createLinearGradient(0, 0, 0, player.h);
      bodyGrad.addColorStop(0, '#4f46e5');
      bodyGrad.addColorStop(1, '#1f2937');

      roundRect(0, 0, player.w, player.h, 10);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(18, -6, 32, 8, 4);
      ctx.fill();
      roundRect(52, -6, 32, 8, 4);
      ctx.fill();

      ctx.restore();
    }

    function drawItem(item) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(Math.sin(item.wobble) * 0.12);

      if (item.kind === 'bookmark') {
        ctx.fillStyle = item.color;
        roundRect(-10, -16, 20, 32, 6);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(-6, -8);
        ctx.lineTo(0, 0);
        ctx.lineTo(6, -8);
        ctx.lineTo(6, 12);
        ctx.lineTo(-6, 12);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f9fafb';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 1);
      }

      ctx.restore();
    }

    function drawParticles() {
      for (const p of game.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawOverlay() {
      if (game.running) return;

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#1f2937';
      ctx.textAlign = 'center';
      ctx.font = '700 28px sans-serif';
      ctx.fillText('Oyun Bitti', W / 2, H / 2 - 10);

      ctx.font = '500 16px sans-serif';
      ctx.fillText('Yeniden Başlat butonuna basabilirsin.', W / 2, H / 2 + 18);
      ctx.restore();
    }

    function renderFrame() {
      drawBackground();
      drawParticles();
      game.items.forEach(drawItem);
      drawPlayer();
      drawOverlay();
    }

    function loop(timestamp) {
      if (!game.running && game.lastTime !== 0) {
        renderFrame();
        return;
      }

      const dt = Math.min(32, timestamp - game.lastTime || 16);
      game.lastTime = timestamp;

      updatePlayer();
      updateItems(dt);
      updateParticles();
      renderFrame();

      if (game.running) {
        requestAnimationFrame(loop);
      }
    }

    restartBtn.addEventListener('click', () => {
      resetGame();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') keys.left = true;
      if (e.key === 'ArrowRight') keys.right = true;
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft') keys.left = false;
      if (e.key === 'ArrowRight') keys.right = false;
    });

    let dragging = false;

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      player.targetX = clamp(x - player.w / 2, 0, W - player.w);
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      player.targetX = clamp(x - player.w / 2, 0, W - player.w);
    });

    canvas.addEventListener('pointerup', () => {
      dragging = false;
    });

    canvas.addEventListener('pointerleave', () => {
      dragging = false;
    });

    resetGame();
    requestAnimationFrame(loop);
  }

  function cryptoRandomId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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