/* ============================================================
   SIGAP Pagentan — App JS
   Sistem Informasi Geospasial Antisipasi Bencana
   Desa Pagentan, Kec. Pagentan, Kab. Banjarnegara
   ============================================================ */

// Koordinat fokus Desa Pagentan, Banjarnegara
const PAGENTAN_CENTER = [-7.2876, 109.7536];
const DEFAULT_ZOOM = 14;

/* ---------- Inisialisasi Peta ---------- */
const map = L.map('map', {
  center: PAGENTAN_CENTER,
  zoom: DEFAULT_ZOOM,
  zoomControl: false,
});
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

/* ---------- Base Layers ---------- */
const baseLayers = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }),
  satellite: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Esri World Imagery' }
  ),
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenTopoMap',
  }),
  dark: L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, attribution: '© Carto' }
  ),
};
let currentBase = baseLayers.satellite.addTo(map);

document.getElementById('basemapSelect').addEventListener('change', (e) => {
  map.removeLayer(currentBase);
  currentBase = baseLayers[e.target.value].addTo(map);
});

/* ---------- Marker batas desa (fitur visual) ---------- */
L.circle(PAGENTAN_CENTER, {
  radius: 2000,
  color: '#06b6d4',
  weight: 2,
  fillOpacity: 0.05,
  dashArray: '6 6',
}).addTo(map).bindPopup('<strong>Desa Pagentan</strong><br/>Kec. Pagentan, Banjarnegara');

L.marker(PAGENTAN_CENTER).addTo(map).bindPopup('📍 Pusat Desa Pagentan');

/* ============================================================
   Layer Manager — TWI / Slope / Mikrotremor / Magnetik (GeoTIFF)
   ============================================================ */
const rasterLayers = {
  twi: { layer: null, georaster: null, visible: false, opacity: 0.7, palette: 'YlGnBu', label: 'TWI' },
  slope: { layer: null, georaster: null, visible: false, opacity: 0.7, palette: 'YlOrRd', label: 'Slope (°)' },
  mikrotremor: { layer: null, georaster: null, visible: false, opacity: 0.7, palette: 'Purples', label: 'Mikrotremor' },
  magnetik: { layer: null, georaster: null, visible: false, opacity: 0.7, palette: 'RdBu', label: 'Magnetik (nT)' },
};

/* Helper: bangun GeoRasterLayer dengan colormap */
function buildRasterLayer(georaster, paletteName, opacity) {
  // tentukan min-max dari sample untuk auto-stretch
  const mins = georaster.mins ? georaster.mins[0] : 0;
  const maxs = georaster.maxs ? georaster.maxs[0] : 1;
  const scale = chroma.scale(paletteName).domain([mins, maxs]);

  return new GeoRasterLayer({
    georaster,
    opacity,
    resolution: 256,
    pixelValuesToColorFn: (values) => {
      const v = values[0];
      if (v === null || v === undefined || isNaN(v)) return null;
      if (georaster.noDataValue !== undefined && v === georaster.noDataValue) return null;
      return scale(v).hex();
    },
  });
}

/* ---------- File Input: load GeoTIFF ---------- */
document.querySelectorAll('.file-input').forEach((input) => {
  input.addEventListener('change', async (e) => {
    const target = input.dataset.target;
    const file = e.target.files[0];
    if (!file) return;

    showLoader(`Memuat ${target.toUpperCase()}…`);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const georaster = await parseGeoraster(arrayBuffer);
      // Remove existing
      if (rasterLayers[target].layer) {
        map.removeLayer(rasterLayers[target].layer);
      }
      const layer = buildRasterLayer(georaster, rasterLayers[target].palette, rasterLayers[target].opacity);
      rasterLayers[target].layer = layer;
      rasterLayers[target].georaster = georaster;

      // Auto-aktifkan
      const toggle = document.querySelector(`.layer-toggle[data-layer="${target}"]`);
      toggle.checked = true;
      rasterLayers[target].visible = true;
      layer.addTo(map);

      // Zoom ke extent layer
      try {
        const b = layer.getBounds();
        map.fitBounds(b, { padding: [40, 40] });
      } catch (err) { /* ignore */ }

      showToast(`Layer ${target.toUpperCase()} berhasil dimuat`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Gagal memuat ${target}: ${err.message}`, 'error');
    } finally {
      hideLoader();
    }
  });
});

/* ---------- Toggle visibility ---------- */
document.querySelectorAll('.layer-toggle').forEach((cb) => {
  cb.addEventListener('change', (e) => {
    const key = cb.dataset.layer;
    if (key === 'rainfall') return; // rainfall hanya saat klik

    const ly = rasterLayers[key];
    if (!ly || !ly.layer) {
      if (cb.checked) {
        showToast('Silakan upload file GeoTIFF terlebih dahulu', 'warning');
        cb.checked = false;
      }
      return;
    }
    if (cb.checked) {
      ly.layer.addTo(map);
      ly.visible = true;
    } else {
      map.removeLayer(ly.layer);
      ly.visible = false;
    }
  });
});

/* ---------- Opacity slider ---------- */
document.querySelectorAll('.opacity-slider').forEach((sl) => {
  sl.addEventListener('input', (e) => {
    const key = sl.dataset.target;
    const op = e.target.value / 100;
    rasterLayers[key].opacity = op;
    if (rasterLayers[key].layer) rasterLayers[key].layer.setOpacity(op);
  });
});

/* ============================================================
   Sampling pixel value at lat/lon from a georaster
   ============================================================ */
function sampleRaster(georaster, lat, lon) {
  if (!georaster) return null;
  const { xmin, ymax, pixelWidth, pixelHeight, width, height, values, noDataValue } = georaster;
  const x = Math.floor((lon - xmin) / pixelWidth);
  const y = Math.floor((ymax - lat) / pixelHeight);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  const v = values[0][y][x];
  if (v === null || v === undefined || isNaN(v)) return null;
  if (noDataValue !== undefined && v === noDataValue) return null;
  return v;
}

/* ============================================================
   Curah Hujan Realtime — Open-Meteo API
   ============================================================ */
async function fetchRainfall(lat, lon) {
  // current rain (mm) + 24h sum
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
              `&current=rain,precipitation,weather_code&hourly=precipitation&past_days=1&forecast_days=1&timezone=auto`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const current = data.current || {};
    const hourly = data.hourly || {};

    // Sum hujan 24 jam terakhir
    let rain24h = 0;
    if (hourly.precipitation && hourly.time) {
      const nowIdx = hourly.time.length > 24 ? hourly.time.length - 1 : hourly.time.length - 1;
      for (let i = Math.max(0, nowIdx - 24); i <= nowIdx; i++) {
        rain24h += (hourly.precipitation[i] || 0);
      }
    }

    return {
      currentRain: current.rain ?? current.precipitation ?? 0,
      rain24h: Number(rain24h.toFixed(1)),
      weatherCode: current.weather_code,
    };
  } catch (err) {
    console.warn('Rainfall fetch error:', err);
    return null;
  }
}

const WMO = {
  0: 'Cerah', 1: 'Sebagian berawan', 2: 'Berawan', 3: 'Mendung',
  45: 'Berkabut', 48: 'Kabut beku',
  51: 'Gerimis ringan', 53: 'Gerimis sedang', 55: 'Gerimis lebat',
  61: 'Hujan ringan', 63: 'Hujan sedang', 65: 'Hujan lebat',
  66: 'Hujan beku ringan', 67: 'Hujan beku lebat',
  71: 'Salju ringan', 73: 'Salju sedang', 75: 'Salju lebat',
  80: 'Hujan tiba-tiba ringan', 81: 'Hujan tiba-tiba sedang', 82: 'Hujan tiba-tiba lebat',
  95: 'Badai petir', 96: 'Badai + hujan es ringan', 99: 'Badai + hujan es lebat',
};

/* ============================================================
   Skor Risiko (normalisasi 0-100 lalu weighted sum)
   ============================================================ */
function normalize(value, min, max) {
  if (value === null || value === undefined || isNaN(value)) return null;
  if (max === min) return 50;
  const n = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, n));
}

function computeRisk(params) {
  // Ambil bobot
  const w = {
    twi: parseFloat(document.getElementById('wTwi').value) || 0,
    slope: parseFloat(document.getElementById('wSlope').value) || 0,
    rain: parseFloat(document.getElementById('wRain').value) || 0,
    mikro: parseFloat(document.getElementById('wMikro').value) || 0,
    mag: parseFloat(document.getElementById('wMag').value) || 0,
  };

  // Normalisasi (asumsi rentang umum — bisa disesuaikan)
  // TWI: 0-25 (lebih tinggi = makin basah/risiko ↑)
  // Slope: 0-60 derajat (lebih curam = risiko longsor ↑)
  // Curah hujan 24h: 0-150 mm (BMKG kategori ekstrem >150mm)
  // Mikrotremor (frekuensi dominan f0): 0-20 Hz — di sini diasumsikan amplifikasi/A0 0-10
  // Magnetik: anomali nT, dipakai |value| range 0-500
  const nTwi   = params.twi !== null ? normalize(params.twi, 0, 25) : null;
  const nSlope = params.slope !== null ? normalize(params.slope, 0, 60) : null;
  const nRain  = params.rain !== null ? normalize(params.rain, 0, 150) : null;
  const nMikro = params.mikro !== null ? normalize(params.mikro, 0, 10) : null;
  const nMag   = params.mag !== null ? normalize(Math.abs(params.mag), 0, 500) : null;

  let totalScore = 0;
  let totalWeight = 0;
  const contrib = [
    { v: nTwi, w: w.twi },
    { v: nSlope, w: w.slope },
    { v: nRain, w: w.rain },
    { v: nMikro, w: w.mikro },
    { v: nMag, w: w.mag },
  ];
  contrib.forEach((c) => {
    if (c.v !== null) {
      totalScore += c.v * c.w;
      totalWeight += c.w;
    }
  });
  if (totalWeight === 0) return null;
  return totalScore / totalWeight;
}

function riskInfo(score) {
  if (score === null) return { color: '#64748b', label: 'Data tidak cukup', value: '-' };
  if (score <= 25) return { color: '#16a34a', label: 'Rendah', value: score.toFixed(1) };
  if (score <= 50) return { color: '#eab308', label: 'Sedang', value: score.toFixed(1) };
  if (score <= 75) return { color: '#f97316', label: 'Tinggi', value: score.toFixed(1) };
  return { color: '#dc2626', label: 'Sangat Tinggi', value: score.toFixed(1) };
}

/* ============================================================
   Klik Peta → tampilkan info di panel
   ============================================================ */
let clickMarker = null;

map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  showInfoPanel();
  document.getElementById('infoBody').innerHTML = `
    <div class="info-coord">📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
    <p class="muted">⏳ Mengambil data curah hujan & sampling raster…</p>
  `;

  // Pin marker
  if (clickMarker) map.removeLayer(clickMarker);
  clickMarker = L.circleMarker([lat, lng], {
    radius: 8, color: '#06b6d4', fillColor: '#06b6d4', fillOpacity: 0.6, weight: 2,
  }).addTo(map);

  // Sample raster
  const twi   = sampleRaster(rasterLayers.twi.georaster, lat, lng);
  const slope = sampleRaster(rasterLayers.slope.georaster, lat, lng);
  const mikro = sampleRaster(rasterLayers.mikrotremor.georaster, lat, lng);
  const mag   = sampleRaster(rasterLayers.magnetik.georaster, lat, lng);

  // Fetch rainfall
  const rain = await fetchRainfall(lat, lng);
  const rainValue = rain ? rain.rain24h : null;

  const score = computeRisk({
    twi, slope, mikro, mag, rain: rainValue,
  });
  const risk = riskInfo(score);

  const fmt = (v, unit = '') => v === null || v === undefined ? '<span style="color:#64748b">tidak ada data</span>' : `${Number(v).toFixed(2)} ${unit}`;

  document.getElementById('infoBody').innerHTML = `
    <div class="info-coord">
      📍 <strong>${lat.toFixed(5)}, ${lng.toFixed(5)}</strong>
    </div>

    <div class="info-param ${twi === null ? 'na' : ''}">
      <span class="label"><i class="fa-solid fa-water" style="color:#3b82f6"></i> TWI</span>
      <span class="value">${fmt(twi)}</span>
    </div>
    <div class="info-param ${slope === null ? 'na' : ''}">
      <span class="label"><i class="fa-solid fa-mountain" style="color:#f59e0b"></i> Slope</span>
      <span class="value">${fmt(slope, '°')}</span>
    </div>
    <div class="info-param">
      <span class="label"><i class="fa-solid fa-cloud-showers-heavy" style="color:#06b6d4"></i> Hujan saat ini</span>
      <span class="value">${rain ? rain.currentRain.toFixed(2) + ' mm' : 'N/A'}</span>
    </div>
    <div class="info-param">
      <span class="label"><i class="fa-solid fa-cloud-rain" style="color:#06b6d4"></i> Hujan 24 jam</span>
      <span class="value">${rain ? rain.rain24h.toFixed(2) + ' mm' : 'N/A'}</span>
    </div>
    <div class="info-param">
      <span class="label"><i class="fa-solid fa-sun" style="color:#fbbf24"></i> Kondisi cuaca</span>
      <span class="value" style="font-size:11px">${rain ? (WMO[rain.weatherCode] || '—') : 'N/A'}</span>
    </div>
    <div class="info-param ${mikro === null ? 'na' : ''}">
      <span class="label"><i class="fa-solid fa-wave-square" style="color:#a855f7"></i> Mikrotremor</span>
      <span class="value">${fmt(mikro)}</span>
    </div>
    <div class="info-param ${mag === null ? 'na' : ''}">
      <span class="label"><i class="fa-solid fa-magnet" style="color:#ef4444"></i> Magnetik</span>
      <span class="value">${fmt(mag, 'nT')}</span>
    </div>

    <div class="risk-badge" style="background: linear-gradient(135deg, ${risk.color}, ${risk.color}cc)">
      <div class="risk-label">Indeks Risiko Bencana</div>
      <div class="risk-value">${risk.value}</div>
      <div class="risk-level">${risk.label}</div>
    </div>

    <p class="hint" style="margin-top:10px">
      <i class="fa-solid fa-circle-info"></i>
      Skor dihitung dari weighted sum parameter yang tersedia (normalisasi 0–100).
      Sesuaikan bobot pada panel "Bobot Skor Risiko".
    </p>
  `;
});

/* ============================================================
   GPS Real-time (watchPosition)
   ============================================================ */
let gpsWatchId = null;
let gpsMarker = null;
let gpsCircle = null;
let followGps = false;

document.getElementById('gpsToggle').addEventListener('change', (e) => {
  if (e.target.checked) startGPS();
  else stopGPS();
});

document.getElementById('goToMyLocation').addEventListener('click', () => {
  if (!gpsMarker) {
    showToast('Aktifkan GPS terlebih dahulu', 'warning');
    return;
  }
  followGps = true;
  map.flyTo(gpsMarker.getLatLng(), 17);
});

function startGPS() {
  if (!navigator.geolocation) {
    setGpsStatus('GPS tidak didukung di perangkat ini', 'error');
    document.getElementById('gpsToggle').checked = false;
    return;
  }
  setGpsStatus('Mencari sinyal GPS…');
  gpsWatchId = navigator.geolocation.watchPosition(
    onGpsUpdate,
    onGpsError,
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}

function stopGPS() {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId = null;
  if (gpsMarker) { map.removeLayer(gpsMarker); gpsMarker = null; }
  if (gpsCircle) { map.removeLayer(gpsCircle); gpsCircle = null; }
  setGpsStatus('GPS dimatikan');
  document.getElementById('gpsLat').textContent = '-';
  document.getElementById('gpsLon').textContent = '-';
  document.getElementById('gpsAcc').textContent = '-';
}

function onGpsUpdate(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  setGpsStatus(`GPS aktif • akurasi ±${Math.round(accuracy)} m`, 'active');
  document.getElementById('gpsLat').textContent = latitude.toFixed(6);
  document.getElementById('gpsLon').textContent = longitude.toFixed(6);
  document.getElementById('gpsAcc').textContent = `${Math.round(accuracy)} m`;

  if (!gpsMarker) {
    gpsMarker = L.marker([latitude, longitude], {
      icon: L.divIcon({
        className: 'gps-marker',
        html: `<div style="
          width:18px;height:18px;border-radius:50%;
          background:#22d3ee;border:3px solid white;
          box-shadow:0 0 0 4px rgba(34,211,238,.35);
        "></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    }).addTo(map).bindPopup('📍 Lokasi Anda');
    gpsCircle = L.circle([latitude, longitude], {
      radius: accuracy, color: '#22d3ee', weight: 1, fillOpacity: 0.1,
    }).addTo(map);
    map.flyTo([latitude, longitude], 16);
  } else {
    gpsMarker.setLatLng([latitude, longitude]);
    gpsCircle.setLatLng([latitude, longitude]).setRadius(accuracy);
    if (followGps) map.panTo([latitude, longitude]);
  }
}

function onGpsError(err) {
  setGpsStatus(`GPS error: ${err.message}`, 'error');
  document.getElementById('gpsToggle').checked = false;
}

function setGpsStatus(msg, type) {
  const el = document.getElementById('gpsStatus');
  el.textContent = msg;
  el.className = 'gps-status' + (type ? ' ' + type : '');
}

/* ============================================================
   Sidebar toggle (responsive)
   ============================================================ */
const sidebar = document.getElementById('sidebar');
const openBtn = document.getElementById('openSidebar');
document.getElementById('toggleSidebar').addEventListener('click', () => {
  sidebar.classList.add('collapsed');
  openBtn.style.display = 'block';
  setTimeout(() => map.invalidateSize(), 350);
});
openBtn.addEventListener('click', () => {
  sidebar.classList.remove('collapsed');
  openBtn.style.display = 'none';
  setTimeout(() => map.invalidateSize(), 350);
});

/* ============================================================
   Info Panel
   ============================================================ */
function showInfoPanel() { document.getElementById('infoPanel').classList.remove('hidden'); }
document.getElementById('closeInfo').addEventListener('click', () => {
  document.getElementById('infoPanel').classList.add('hidden');
  if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; }
});

/* ============================================================
   Loader & Toast
   ============================================================ */
function showLoader(text = 'Memuat…') {
  document.getElementById('loaderText').textContent = text;
  document.getElementById('loader').classList.remove('hidden');
}
function hideLoader() { document.getElementById('loader').classList.add('hidden'); }

let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ============================================================
   Search Box (Geosearch — OSM Nominatim)
   ============================================================ */
const provider = new GeoSearch.OpenStreetMapProvider();
const searchControl = new GeoSearch.GeoSearchControl({
  provider, style: 'bar', position: 'topright',
  showMarker: true, autoClose: true, retainZoomLevel: false, animateZoom: true,
  searchLabel: 'Cari lokasi di Pagentan…',
});
map.addControl(searchControl);

/* ============================================================
   Welcome toast
   ============================================================ */
setTimeout(() => {
  showToast('Selamat datang di SIGAP Pagentan! Klik di peta untuk mulai analisis 👋', 'success');
}, 600);
