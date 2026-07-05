# Study Universe

Canli site: [Study Universe](https://study-universe-bjyg.onrender.com)

Study Universe; kitaplari listelemek, aramak, filtrelemek ve yonetici girisiyle kitap ekleyip duzenlemek icin hazirlanmis backend destekli bir kitap arsivi uygulamasidir.

## Ozellikler

- Ana sayfada son eklenen kitaplari gosterir.
- Kitaplar sayfasinda arama, kategori filtresi ve siralama vardir.
- Yonetici girisiyle kitap ekleme, duzenleme ve silme yapilabilir.
- Sifre frontend kodunda saklanmaz.
- PostgreSQL bagliyken kitaplar kalici olarak veritabaninda tutulur.
- Yerelde `DATABASE_URL` yoksa JSON dosyalariyla calismaya devam eder.

## Teknolojiler

- HTML
- CSS
- JavaScript
- Node.js
- PostgreSQL

## Yerelde Calistirma

Projeyi bilgisayarinda calistirmak icin:

```powershell
npm install
npm start
```

Sonra tarayicidan ac:

```text
http://localhost:3000
```

Windows'ta `start.bat` dosyasini da kullanabilirsin.

## Render Ayarlari

Render Web Service ayarlari:

```text
Build Command: npm install
Start Command: npm start
```

Environment Variables:

```text
NODE_ENV=production
DATABASE_URL=<Render PostgreSQL Internal Database URL>
```

`DATABASE_URL` varsa uygulama PostgreSQL kullanir. Yoksa yerelde `data/books.json` ve `data/admin.json` dosyalarini kullanir.

## Guvenlik Notlari

GitHub'a yuklenmemesi gereken dosyalar:

```text
data/admin.json
data/books.json
node_modules/
```

Bu dosyalar `.gitignore` icinde tutulmalidir.

Yonetici sifresi duz yazi olarak saklanmaz. Backend tarafinda salt'li PBKDF2 hash olarak tutulur.

## Proje Yapisi

```text
server.js
package.json
README.md
.gitignore
index.html
kitaplar.html
hakkimda.html
script.js
style.css
start.bat
```

`public/` klasoru varsa server statik dosyalari oradan servis eder. Yoksa kok dizindeki HTML/CSS/JS dosyalarini kullanir.
