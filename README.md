# SIGAP Pagentan 🏔️

**S**istem **I**nformasi **G**eospasial **A**ntisipasi **P**emetaan Bencana — Desa Pagentan, Kec. Pagentan, Kab. Banjarnegara.

Aplikasi web pemetaan risiko bencana berbasis **TWI**, **Slope**, **Curah Hujan Realtime**, **Mikrotremor**, dan **Magnetik**. Mendukung overlay GeoTIFF, GPS realtime, dan analisis klik lokasi.

---

## ✨ Fitur

| Fitur | Keterangan |
|---|---|
| 🗺️ Multi-basemap | OSM, Citra Satelit (Esri), Topografi, Dark Mode |
| 📤 Overlay GeoTIFF | Upload `.tif/.tiff` untuk TWI, Slope, Mikrotremor, Magnetik |
| 🌧️ Curah hujan **realtime** | Open-Meteo API (gratis, tanpa API key) |
| 📍 GPS realtime | `watchPosition` dengan akurasi & ikuti lokasi |
| 🖱️ Klik lokasi | Sampling nilai semua layer + skor risiko |
| ⚖️ Bobot risiko | Bisa diubah on-the-fly |
| 🎨 UI/UX profesional | Dark theme, responsive, ikon Font Awesome |
| 🔍 Pencarian alamat | Geosearch berbasis Nominatim |

---

## 🚀 Cara Menjalankan di VSCode

1. **Salin folder `sigap-pagentan`** ke komputer Anda.
2. Buka folder di **VSCode**.
3. Install ekstensi **Live Server** (Ritwick Dey) di VSCode.
4. Klik kanan pada `index.html` → **Open with Live Server**.
5. Browser akan terbuka di `http://127.0.0.1:5500/index.html`.

> ⚠️ **Jangan** membuka `index.html` langsung lewat `file://` — beberapa fitur (fetch API, file reader) butuh server.

### Alternatif tanpa Live Server (pakai Python):
```bash
cd sigap-pagentan
python -m http.server 8000
# buka http://localhost:8000
```

### Alternatif pakai Node.js:
```bash
npx serve sigap-pagentan
```

---

## 📁 Struktur Project
```
sigap-pagentan/
├── index.html         # Halaman utama
├── css/
│   └── style.css      # Styling (dark professional theme)
├── js/
│   └── app.js         # Logika peta, GPS, raster, scoring
├── assets/            # (opsional) untuk ikon / data lokal
└── README.md
```

---

## 📊 Format Data yang Didukung

### GeoTIFF (untuk TWI, Slope, Mikrotremor, Magnetik)
- **Format:** `.tif` atau `.tiff`
- **Projection:** **WGS84 / EPSG:4326** (paling kompatibel).
  Jika data Anda dalam UTM (mis. EPSG:32749 untuk Banjarnegara), reproject dulu di QGIS:
  `Raster → Projections → Warp (Reproject)` → target CRS: `EPSG:4326`.
- **Single band** raster (jika multi-band, hanya band 1 yang ditampilkan).
- **NoData value** disarankan diset agar area kosong transparan.

### Curah hujan
Diambil otomatis dari **Open-Meteo Forecast API**:
- `current.rain` (mm saat ini)
- Akumulasi 24 jam dari `hourly.precipitation`

---

## ⚖️ Rumus Skor Risiko

Skor (0–100) = Σ (nilai_normalisasi × bobot) / Σ(bobot)

Normalisasi (asumsi default, sesuaikan jika perlu):
| Parameter | Rentang | Arah |
|---|---|---|
| TWI | 0 – 25 | makin tinggi → risiko ↑ |
| Slope | 0° – 60° | makin curam → risiko longsor ↑ |
| Hujan 24h | 0 – 150 mm | makin tinggi → risiko ↑ |
| Mikrotremor (A₀) | 0 – 10 | makin tinggi → amplifikasi ↑ |
| Magnetik | 0 – 500 nT (\|absolut\|) | anomali tinggi → fitur geologi |

Klasifikasi:
- 🟢 **0–25** Rendah
- 🟡 **26–50** Sedang
- 🟠 **51–75** Tinggi
- 🔴 **76–100** Sangat Tinggi

> Bobot default: Slope 0.30, TWI 0.25, Hujan 0.25, Mikrotremor 0.10, Magnetik 0.10. Total = 1.0.

---

## 🛠️ Tips Lanjutan

- **Mengganti koordinat pusat desa:** edit `PAGENTAN_CENTER` di `js/app.js` baris atas.
- **Mengganti colormap raster:** ubah `palette` di objek `rasterLayers` (`YlGnBu`, `YlOrRd`, `Viridis`, dll — lihat chroma-js).
- **Menyimpan data permanen:** taruh GeoTIFF di folder `assets/` lalu load otomatis via `fetch('assets/twi.tif')` di `app.js`.
- **Build versi production / mobile:** bisa dibungkus PWA atau Capacitor — minta saja jika perlu.

---

## 📚 Library yang Dipakai (semua via CDN, no install)
- [Leaflet 1.9.4](https://leafletjs.com/)
- [leaflet-geosearch](https://github.com/smeijer/leaflet-geosearch)
- [georaster](https://github.com/GeoTIFF/georaster) + [georaster-layer-for-leaflet](https://github.com/GeoTIFF/georaster-layer-for-leaflet)
- [chroma-js](https://gka.github.io/chroma.js/)
- [Font Awesome 6](https://fontawesome.com/)
- [Open-Meteo API](https://open-meteo.com/)

---

## 📝 Lisensi
MIT — bebas digunakan untuk penelitian, tugas akhir, dan keperluan instansi.

Made with ❤️ for Pagentan, Banjarnegara.
