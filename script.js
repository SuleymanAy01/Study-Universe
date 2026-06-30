const themeButtons = document.querySelectorAll('[data-theme-toggle]');
const scrollTopButton = document.querySelector('.scroll-top');
const pageLinks = document.querySelectorAll('a[href$=".html"]');
const body = document.body;

const bookData = [
  {
    title: 'Kürk Mantolu Madonna',
    author: 'Sabahattin Ali',
    category: 'Roman',
    desc: 'Yalnızlık, iç dünya ve anlaşılma isteği üzerine etkileyici bir roman.'
  },
  {
    title: 'Atomik Alışkanlıklar',
    author: 'James Clear',
    category: 'Kişisel Gelişim',
    desc: 'Küçük alışkanlıkların zaman içinde büyük değişimler oluşturmasını anlatır.'
  },
  {
    title: 'Simyacı',
    author: 'Paulo Coelho',
    category: 'Felsefe',
    desc: 'Kendi yolunu bulmak, işaretleri fark etmek ve hayallerin peşinden gitmek üzerine.'
  },
  {
    title: 'Zamanın Kısa Tarihi',
    author: 'Stephen Hawking',
    category: 'Bilim',
    desc: 'Evren, zaman ve kara delikler hakkında merak uyandıran popüler bilim kitabı.'
  }
];

const state = {
  books: JSON.parse(localStorage.getItem('study-universe-books')) || bookData,
  theme: localStorage.getItem('study-universe-theme') || 'light',
  filter: 'all',
  sort: 'latest',
  search: ''
};

function applyTheme(theme) {
  const isDark = theme === 'dark';
  body.classList.toggle('dark', isDark);
  localStorage.setItem('study-universe-theme', theme);

  themeButtons.forEach((button) => {
    const label = button.querySelector('.theme-icon');
    if (label) {
      label.textContent = isDark ? '◑' : '◐';
    }
  });
}

function saveBooks() {
  localStorage.setItem('study-universe-books', JSON.stringify(state.books));
}

function normalize(value) {
  return value.toLocaleLowerCase('tr-TR').trim();
}

function getSortedBooks(list) {
  const copy = [...list];

  if (state.sort === 'title') {
    return copy.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  }

  if (state.sort === 'oldest') {
    return copy.reverse();
  }

  return copy;
}

function renderBooks() {
  const list = document.getElementById('bookList');
  const emptyState = document.getElementById('emptyState');
  const count = document.getElementById('bookCount');

  if (!list) {
    return;
  }

  const visible = getSortedBooks(state.books).filter((book) => {
    const text = `${book.title} ${book.author} ${book.category} ${book.desc}`;
    const matchesSearch = normalize(text).includes(normalize(state.search));
    const matchesFilter = state.filter === 'all' || book.category === state.filter;
    return matchesSearch && matchesFilter;
  });

  if (count) {
    count.textContent = String(visible.length);
  }

  if (visible.length === 0) {
    list.innerHTML = '';
    if (emptyState) {
      emptyState.hidden = false;
    }
    return;
  }

  if (emptyState) {
    emptyState.hidden = true;
  }

  list.innerHTML = visible
    .map((book, index) => {
      const colorClass =
        book.category === 'Roman' ? 'purple' :
        book.category === 'Bilim' ? 'blue' :
        book.category === 'Felsefe' ? 'orange' : 'green';

      const iconClass =
        book.category === 'Roman' ? 'gradient-purple' :
        book.category === 'Bilim' ? 'gradient-blue' :
        book.category === 'Felsefe' ? 'gradient-orange' : 'gradient-green';

      const icon =
        book.category === 'Roman' ? '◫' :
        book.category === 'Bilim' ? '⚛' :
        book.category === 'Felsefe' ? '◌' : '◎';

      return `
        <article class="book-card">
          <div class="book-topline">
            <span class="tag ${colorClass}">${book.category}</span>
            <button class="fav" type="button" aria-label="Favori">♡</button>
          </div>
          <div class="book-icon ${iconClass}">${icon}</div>
          <h3>${book.title}</h3>
          <p class="author">${book.author}</p>
          <p class="excerpt">${book.desc}</p>
          <div class="card-actions">
            <button class="ghost delete" type="button" data-delete="${index}">Sil</button>
            <button class="ghost edit" type="button">Düzenle</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function toggleFilterButtons(target) {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.classList.toggle('active', button === target);
  });
}

function setScrollTopVisibility() {
  if (!scrollTopButton) {
    return;
  }

  scrollTopButton.classList.toggle('visible', window.scrollY > 240);
}

themeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextTheme = body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
});

pageLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const targetPage = link.getAttribute('href');

    if (currentPage === targetPage) {
      return;
    }

    event.preventDefault();
    body.classList.add('page-out');

    window.setTimeout(() => {
      window.location.href = targetPage;
    }, 220);
  });
});

document.addEventListener('click', (event) => {
  const filterButton = event.target.closest('[data-filter]');
  const deleteButton = event.target.closest('[data-delete]');
  const addFirstBook = event.target.closest('#addFirstBook');

  if (filterButton) {
    state.filter = filterButton.dataset.filter;
    toggleFilterButtons(filterButton);
    renderBooks();
    return;
  }

  if (deleteButton) {
    const index = Number(deleteButton.dataset.delete);
    state.books.splice(index, 1);
    saveBooks();
    renderBooks();
    return;
  }

  if (addFirstBook) {
    document.getElementById('title')?.focus();
  }
});

document.getElementById('searchInput')?.addEventListener('input', (event) => {
  state.search = event.target.value;
  renderBooks();
});

document.getElementById('sortSelect')?.addEventListener('change', (event) => {
  state.sort = event.target.value;
  renderBooks();
});

document.getElementById('bookForm')?.addEventListener('submit', (event) => {
  event.preventDefault();

  const title = document.getElementById('title').value.trim();
  const author = document.getElementById('author').value.trim();
  const category = document.getElementById('category').value.trim();
  const desc = document.getElementById('desc').value.trim();

  if (!title || !author || !category || !desc) {
    return;
  }

  state.books.unshift({
    title,
    author,
    category,
    desc
  });

  saveBooks();
  event.target.reset();
  state.filter = 'all';
  state.search = '';
  state.sort = 'latest';

  document.getElementById('searchInput').value = '';
  document.getElementById('sortSelect').value = 'latest';
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === 'all');
  });

  renderBooks();
});

scrollTopButton?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

window.addEventListener('scroll', setScrollTopVisibility);

applyTheme(state.theme);
renderBooks();
setScrollTopVisibility();