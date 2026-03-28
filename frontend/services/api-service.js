/**
 * TUA API Service
 * Backend (Rust/Axum) ile iletişim katmanı.
 * Backend çalışmıyorken mock veriler döndürür.
 */
import { eventBus, Events } from './event-bus.js';

const API_BASE = 'http://localhost:8080/api';
const WS_URL = 'ws://localhost:8080/ws';

class TuaApiService {
  constructor() {
    this._ws = null;
    this._useMock = false;
    this._checkBackend();
  }

  async _checkBackend() {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        this._useMock = false;
        console.log('[API] ✅ Backend bağlantısı aktif');
      } else {
        this._useMock = true;
      }
    } catch {
      this._useMock = true;
      console.log('[API] ⚠️ Backend bulunamadı, mock veriler kullanılıyor');
    }
  }

  async _fetch(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`[API] Fetch hatası (${endpoint}):`, err.message);
      return null;
    }
  }

  // ======================= ANALİZ =======================

  async startAnalysis(params) {
    eventBus.emit(Events.LOADING_START, { task: 'analysis' });
    eventBus.emit(Events.ANALYSIS_START, params);

    if (this._useMock) {
      return this._mockAnalysis(params);
    }

    const result = await this._fetch('/analyze', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    if (result) {
      eventBus.emit(Events.ANALYSIS_COMPLETE, result);
      eventBus.emit(Events.LOADING_END, { task: 'analysis' });
    }
    return result || this._mockAnalysis(params);
  }

  async _mockAnalysis(params) {
    // Simüle analiz süreci (progress)
    const disasterType = params.disasterType || 'earthquake';
    const steps = [
      { progress: 10, message: 'Uydu görüntüleri alınıyor...' },
      { progress: 25, message: 'Görüntü ön-işleme yapılıyor...' },
      { progress: 40, message: 'AI modeli yükleniyor...' },
      { progress: 55, message: 'Hasar analizi çalıştırılıyor...' },
      { progress: 70, message: 'Risk bölgeleri hesaplanıyor...' },
      { progress: 85, message: 'Kurtarma noktaları belirleniyor...' },
      { progress: 95, message: 'Sonuçlar derleniyor...' },
    ];

    for (const step of steps) {
      await this._delay(400 + Math.random() * 300);
      eventBus.emit(Events.ANALYSIS_PROGRESS, step);
    }

    const result = this._generateMockAnalysisResult(disasterType, params.center);
    await this._delay(300);
    eventBus.emit(Events.ANALYSIS_COMPLETE, result);
    eventBus.emit(Events.LOADING_END, { task: 'analysis' });
    eventBus.emit(Events.ALERT_SHOW, {
      type: 'success',
      title: 'Analiz Tamamlandı',
      message: `${result.summary.totalHazards} tehlike noktası tespit edildi.`,
    });
    return result;
  }

  _generateMockAnalysisResult(disasterType, center = [39.925, 32.85]) {
    const lat = center[0], lng = center[1];
    const hazardTypes = {
      earthquake: ['Bina Çökmesi', 'Yol Hasarı', 'Altyapı Hasarı', 'Köprü Hasarı', 'Yangın Riski'],
      flood: ['Su Baskını', 'Toprak Kayması', 'Yol Kapanması', 'Köprü Hasarı', 'Elektrik Kesintisi'],
      fire: ['Aktif Yangın', 'Yangın Riski', 'Duman Bölgesi', 'Tahliye Gerekli', 'Su Kaynağı Yok'],
      landslide: ['Heyelan Bölgesi', 'Yol Kapanması', 'Bina Riski', 'Zemin Çökmesi', 'Kaya Düşmesi'],
    };

    const types = hazardTypes[disasterType] || hazardTypes.earthquake;
    const hazards = [];
    const count = 8 + Math.floor(Math.random() * 7);

    for (let i = 0; i < count; i++) {
      const offsetLat = (Math.random() - 0.5) * 0.08;
      const offsetLng = (Math.random() - 0.5) * 0.12;
      hazards.push({
        id: `hz-${i}`,
        type: types[Math.floor(Math.random() * types.length)],
        severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)],
        location: [lat + offsetLat, lng + offsetLng],
        radius: 80 + Math.random() * 300,
        confidence: 0.65 + Math.random() * 0.3,
      });
    }

    const rescuePoints = [];
    const rpCount = 3 + Math.floor(Math.random() * 3);
    const rpNames = ['Ana Toplanma Alanı', 'Hastane Bölgesi', 'Helikopter Pisti', 'Güvenli Kamp', 'Lojistik Merkez', 'Acil Yardım Noktası'];
    for (let i = 0; i < rpCount; i++) {
      rescuePoints.push({
        id: `rp-${i}`,
        name: rpNames[i % rpNames.length],
        location: [lat + (Math.random() - 0.5) * 0.06, lng + (Math.random() - 0.5) * 0.1],
        capacity: Math.floor(100 + Math.random() * 500),
        status: ['active', 'active', 'preparing'][Math.floor(Math.random() * 3)],
      });
    }

    // Tehlike bölgeleri (polygon)
    const hazardZones = [];
    for (let z = 0; z < 3; z++) {
      const cLat = lat + (Math.random() - 0.5) * 0.05;
      const cLng = lng + (Math.random() - 0.5) * 0.08;
      const r = 0.008 + Math.random() * 0.015;
      const points = [];
      for (let a = 0; a < 2 * Math.PI; a += Math.PI / 4) {
        const jitter = 0.7 + Math.random() * 0.6;
        points.push([
          cLat + Math.sin(a) * r * jitter,
          cLng + Math.cos(a) * r * jitter * 1.3,
        ]);
      }
      points.push(points[0]); // close polygon
      hazardZones.push({
        id: `zone-${z}`,
        risk: ['high', 'critical', 'medium'][z],
        polygon: points,
      });
    }

    const damagePercentage = 15 + Math.random() * 55;
    return {
      id: `analysis-${Date.now()}`,
      disasterType,
      timestamp: new Date().toISOString(),
      center: [lat, lng],
      summary: {
        damagePercentage: Math.round(damagePercentage * 10) / 10,
        affectedAreaKm2: Math.round((5 + Math.random() * 30) * 10) / 10,
        riskLevel: damagePercentage > 50 ? 'critical' : damagePercentage > 30 ? 'high' : 'medium',
        totalHazards: hazards.length,
        populationAffected: Math.floor(5000 + Math.random() * 50000),
        buildingsDamaged: Math.floor(50 + Math.random() * 400),
      },
      hazards,
      rescuePoints,
      hazardZones,
    };
  }

  // ======================= ROTA =======================

  async calculateRoute(params) {
    eventBus.emit(Events.LOADING_START, { task: 'route' });

    if (this._useMock) {
      return this._mockRoute(params);
    }

    const result = await this._fetch('/route/calculate', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    if (result) {
      eventBus.emit(Events.ROUTE_READY, result);
      eventBus.emit(Events.LOADING_END, { task: 'route' });
    }
    return result || this._mockRoute(params);
  }

  async _mockRoute(params) {
    await this._delay(800 + Math.random() * 600);
    const { start, end, hazards = [] } = params;

    // A* benzeri basit rota oluştur — tehlike bölgelerinden kaçınarak
    const route = this._generateSafeRoute(start, end, hazards);
    const altRoute = this._generateSafeRoute(start, end, hazards, 0.6);

    const result = {
      id: `route-${Date.now()}`,
      primary: {
        waypoints: route,
        distance: this._calculateDistance(route),
        duration: Math.floor(10 + Math.random() * 30),
        riskScore: Math.round((15 + Math.random() * 25) * 10) / 10,
        status: 'safe',
      },
      alternative: {
        waypoints: altRoute,
        distance: this._calculateDistance(altRoute),
        duration: Math.floor(15 + Math.random() * 40),
        riskScore: Math.round((30 + Math.random() * 40) * 10) / 10,
        status: 'moderate',
      },
    };

    eventBus.emit(Events.ROUTE_READY, result);
    eventBus.emit(Events.LOADING_END, { task: 'route' });
    eventBus.emit(Events.ALERT_SHOW, {
      type: 'info',
      title: 'Güvenli Rota Hazır',
      message: `${result.primary.distance.toFixed(1)} km, risk skoru: ${result.primary.riskScore}`,
    });
    return result;
  }

  _generateSafeRoute(start, end, hazards, jitterScale = 1) {
    const steps = 14 + Math.floor(Math.random() * 6);
    const points = [start];

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      // Bezier-ish curve between start and end
      const baseLat = start[0] + (end[0] - start[0]) * t;
      const baseLng = start[1] + (end[1] - start[1]) * t;

      // Jitter to avoid hazards
      const curve = Math.sin(t * Math.PI) * 0.012 * jitterScale;
      const jitter = (Math.random() - 0.5) * 0.004 * jitterScale;

      points.push([
        baseLat + curve + jitter,
        baseLng + (Math.random() - 0.5) * 0.006 * jitterScale,
      ]);
    }

    points.push(end);
    return points;
  }

  _calculateDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dLat = points[i][0] - points[i - 1][0];
      const dLng = points[i][1] - points[i - 1][1];
      total += Math.sqrt(dLat * dLat + dLng * dLng) * 111; // approx km
    }
    return Math.round(total * 10) / 10;
  }

  // ======================= TEHLİKE VERİ =======================

  async getHazards() {
    if (this._useMock) return [];
    return (await this._fetch('/hazards')) || [];
  }

  async getRescuePoints() {
    if (this._useMock) return [];
    return (await this._fetch('/rescue-points')) || [];
  }

  // ======================= YARDIMCI =======================

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  connectWebSocket() {
    if (this._useMock) return;
    try {
      this._ws = new WebSocket(WS_URL);
      this._ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        eventBus.emit(data.event, data.payload);
      };
      this._ws.onerror = () => console.warn('[WS] Bağlantı hatası');
    } catch {
      console.warn('[WS] WebSocket desteklenmiyor');
    }
  }
}

export const apiService = new TuaApiService();
export default apiService;
