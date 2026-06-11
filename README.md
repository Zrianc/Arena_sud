[README.md](https://github.com/user-attachments/files/28835046/README.md)
# 🟡 Čovječe Liga

**Web aplikacija za praćenje rezultata Čovječe ne ljuti se lige.**

Pac-Man dizajn · Tamni/Svjetli način · Mobile responsive · localStorage · Bez servera

---

## 🚀 Deploy na GitHub Pages

### 1. Napravi repozitorij

1. Idi na [github.com](https://github.com) → **New repository**
2. Ime npr. `covjece-liga`
3. Postavi na **Public**
4. Klikni **Create repository**

### 2. Upload datoteka

**Opcija A — web sučelje (lakše):**
1. U repozitoriju klikni **Add file → Upload files**
2. Prevuci sve 3 datoteke: `index.html`, `style.css`, `app.js`
3. Klikni **Commit changes**

**Opcija B — git:**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TVOJE-IME/covjece-liga.git
git push -u origin main
```

### 3. Uključi GitHub Pages

1. Idi u **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` → folder: `/ (root)`
4. Klikni **Save**

### 4. Otvori stranicu

Nakon ~2 minute stranica je živa na:
```
https://TVOJE-IME.github.io/covjece-liga/
```

---

## 📋 Funkcionalnosti

- 🏆 Liga tablica sa sortiranjem (REZ, pobjede, drekovi, muhe)
- ➕ Unos kola — 4 partije s 1./2./3. mjestom i drekom + muhe
- 📋 Povijest kola — pregled, uređivanje, brisanje
- 👥 Upravljanje igračima (4–8 igrača/parova)
- 📊 Statistika po igraču (klik na red u tablici)
- 💾 Export/Import JSON backup
- 🌙 Dark/Light mode
- 📱 Mobile responsive s horizontalnim scrollom tablice

---

## 🎮 Pravila

- Minimalno 4, maksimalno 8 igrača (ili parova)
- 4 partije po kolu
- Plasmani: 1.=1bod, 2.=2boda, 3.=3boda, Drek=4boda
- REZ = ukupni bodovi / broj partija (manji = bolji)
- Drek: 1–4 muhe ovisno o nespremljenoj figuri
