/**
 * TUA Route Planner — Güvenli Rota Planlama Paneli
 * Başlangıç/bitiş noktası seçimi, rota hesaplama, detaylar.
 */
import { eventBus, Events } from '../services/event-bus.js';
import { apiService } from '../services/api-service.js';

class TuaRoutePlanner extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._startPoint = null;
    this._endPoint = null;
    this._selectingPoint = null; // 'start' | 'end' | null
    this._routeData = null;
    this._analysisData = null;
  }

  connectedCallback() {
    this.render();
    this._bindEvents();
  }

  _bindEvents() {
    eventBus.on(Events.MAP_CLICK, (latlng) => {
      if (this._selectingPoint === 'start') {
        this._startPoint = [latlng.lat, latlng.lng];
        this._updatePointDisplay('start', this._startPoint);
        this._selectingPoint = null;
        this._updateButtons();
      } else if (this._selectingPoint === 'end') {
        this._endPoint = [latlng.lat, latlng.lng];
        this._updatePointDisplay('end', this._endPoint);
        this._selectingPoint = null;
        this._updateButtons();
      }
    });

    eventBus.on(Events.ANALYSIS_COMPLETE, (data) => {
      this._analysisData = data;
      // Auto-set rescue point as end
      if (data.rescuePoints && data.rescuePoints.length > 0) {
        this._endPoint = data.rescuePoints[0].location;
        this._updatePointDisplay('end', this._endPoint);
        this._updateButtons();
      }
    });

    eventBus.on(Events.ROUTE_READY, (data) => {
      this._routeData = data;
      this._showRouteDetails();
    });

    // Button handlers
    this.shadowRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      
      if (btn.classList.contains('btn-select-start')) {
        this._selectingPoint = 'start';
        this._updateButtons();
        eventBus.emit(Events.ALERT_SHOW, { type: 'info', title: 'Başlangıç Noktası', message: 'Haritada bir nokta seçin', duration: 3000 });
      } else if (btn.classList.contains('btn-select-end')) {
        this._selectingPoint = 'end';
        this._updateButtons();
        eventBus.emit(Events.ALERT_SHOW, { type: 'info', title: 'Bitiş Noktası', message: 'Haritada bir nokta seçin', duration: 3000 });
      } else if (btn.classList.contains('btn-calculate')) {
        this._calculateRoute();
      } else if (btn.classList.contains('btn-clear')) {
        this._clearRoute();
      }
    });
  }

  async _calculateRoute() {
    if (!this._startPoint || !this._endPoint) {
      eventBus.emit(Events.ALERT_SHOW, { type: 'warning', title: 'Eksik Bilgi', message: 'Lütfen başlangıç ve bitiş noktası seçin.' });
      return;
    }

    const calcBtn = this.shadowRoot.querySelector('.btn-calculate');
    if (calcBtn) {
      calcBtn.disabled = true;
      calcBtn.innerHTML = '<span class="spinner"></span> Hesaplanıyor...';
    }

    const hazards = this._analysisData?.hazards || [];
    await apiService.calculateRoute({
      start: this._startPoint,
      end: this._endPoint,
      hazards,
    });

    if (calcBtn) {
      calcBtn.disabled = false;
      calcBtn.innerHTML = '🛰️ Güvenli Rota Hesapla';
    }
  }

  _clearRoute() {
    this._startPoint = null;
    this._endPoint = null;
    this._routeData = null;
    this._selectingPoint = null;
    this._updatePointDisplay('start', null);
    this._updatePointDisplay('end', null);
    this._updateButtons();
    this.shadowRoot.querySelector('.route-details').innerHTML = '';
    this.shadowRoot.querySelector('.route-details').classList.remove('visible');
    eventBus.emit(Events.ROUTE_CLEAR);
  }

  _updatePointDisplay(type, coords) {
    const el = this.shadowRoot.querySelector(`.point-${type} .point-coords`);
    if (el) {
      el.textContent = coords ? `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}` : 'Seçilmedi';
      el.classList.toggle('selected', !!coords);
    }
  }

  _updateButtons() {
    const startBtn = this.shadowRoot.querySelector('.btn-select-start');
    const endBtn = this.shadowRoot.querySelector('.btn-select-end');
    const calcBtn = this.shadowRoot.querySelector('.btn-calculate');

    if (startBtn) startBtn.classList.toggle('selecting', this._selectingPoint === 'start');
    if (endBtn) endBtn.classList.toggle('selecting', this._selectingPoint === 'end');
    if (calcBtn) calcBtn.disabled = !(this._startPoint && this._endPoint);
  }

  _showRouteDetails() {
    const el = this.shadowRoot.querySelector('.route-details');
    if (!el || !this._routeData) return;
    el.classList.add('visible');

    const p = this._routeData.primary;
    const a = this._routeData.alternative;

    el.innerHTML = `
      <div class="route-card primary">
        <div class="route-header">
          <span class="route-badge safe">⬤ ÖNERİLEN ROTA</span>
        </div>
        <div class="route-stats">
          <div class="route-stat">
            <span class="rs-value">${p.distance.toFixed(1)}</span>
            <span class="rs-label">km</span>
          </div>
          <div class="route-stat">
            <span class="rs-value">${p.duration}</span>
            <span class="rs-label">dk</span>
          </div>
          <div class="route-stat">
            <span class="rs-value risk-val-${p.riskScore > 30 ? 'high' : 'low'}">${p.riskScore}</span>
            <span class="rs-label">Risk</span>
          </div>
        </div>
      </div>
      <div class="route-card alternative">
        <div class="route-header">
          <span class="route-badge alt">⬤ ALTERNATİF ROTA</span>
        </div>
        <div class="route-stats">
          <div class="route-stat">
            <span class="rs-value">${a.distance.toFixed(1)}</span>
            <span class="rs-label">km</span>
          </div>
          <div class="route-stat">
            <span class="rs-value">${a.duration}</span>
            <span class="rs-label">dk</span>
          </div>
          <div class="route-stat">
            <span class="rs-value risk-val-${a.riskScore > 30 ? 'high' : 'low'}">${a.riskScore}</span>
            <span class="rs-label">Risk</span>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: 'Inter', sans-serif; }
        
        .section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #ff6b35;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .section-title::before {
          content: '';
          width: 3px;
          height: 14px;
          background: linear-gradient(180deg, #ff6b35, #ffab00);
          border-radius: 2px;
        }

        /* Points */
        .points-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 14px;
        }
        .point-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .point-marker {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .point-start .point-marker { background: rgba(0,230,118,0.15); color: #00e676; border: 1.5px solid rgba(0,230,118,0.3); }
        .point-end .point-marker { background: rgba(255,59,59,0.15); color: #ff3b3b; border: 1.5px solid rgba(255,59,59,0.3); }
        .point-info { flex: 1; min-width: 0; }
        .point-label { font-size: 10px; color: #5a6380; text-transform: uppercase; letter-spacing: 0.5px; }
        .point-coords {
          font-size: 12px;
          color: #5a6380;
          font-family: 'JetBrains Mono', monospace;
          font-style: italic;
        }
        .point-coords.selected { color: #e8ecf4; font-style: normal; }
        .point-line {
          width: 2px;
          height: 16px;
          margin-left: 13px;
          background: repeating-linear-gradient(180deg, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 3px, transparent 3px, transparent 6px);
        }

        /* Buttons */
        .btn-row {
          display: flex;
          gap: 6px;
          margin-bottom: 6px;
        }
        .btn-select {
          flex: 1;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: #8892b0;
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.25s;
        }
        .btn-select:hover { border-color: rgba(0,212,255,0.3); color: #e8ecf4; background: rgba(0,212,255,0.05); }
        .btn-select.selecting {
          border-color: rgba(0,212,255,0.5);
          background: rgba(0,212,255,0.1);
          color: #00d4ff;
          animation: pulse 1.2s infinite;
        }

        .btn-calculate {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #ff6b35, #ff8f5e);
          color: white;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          margin-bottom: 8px;
          letter-spacing: 0.3px;
        }
        .btn-calculate:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(255,107,53,0.3);
        }
        .btn-calculate:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          transform: none;
        }
        .btn-clear {
          width: 100%;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.06);
          background: transparent;
          color: #5a6380;
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-clear:hover { color: #ff3b3b; border-color: rgba(255,59,59,0.2); }

        /* Route Details */
        .route-details {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .route-details.visible { max-height: 400px; margin-top: 14px; }
        .route-card {
          padding: 12px;
          border-radius: 10px;
          margin-bottom: 8px;
          border: 1px solid rgba(255,255,255,0.04);
          background: rgba(255,255,255,0.02);
          animation: fadeSlideIn 0.4s ease;
        }
        .route-card.primary { border-color: rgba(0,230,118,0.2); }
        .route-card.alternative { border-color: rgba(255,171,0,0.15); }
        .route-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
          padding: 3px 10px;
          border-radius: 12px;
        }
        .route-badge.safe { background: rgba(0,230,118,0.12); color: #00e676; }
        .route-badge.alt { background: rgba(255,171,0,0.12); color: #ffab00; }
        .route-stats {
          display: flex;
          gap: 12px;
          margin-top: 10px;
        }
        .route-stat {
          flex: 1;
          text-align: center;
        }
        .rs-value {
          font-size: 18px;
          font-weight: 800;
          color: #e8ecf4;
          display: block;
        }
        .rs-label { font-size: 10px; color: #5a6380; text-transform: uppercase; }
        .risk-val-high { color: #ff6b35 !important; }
        .risk-val-low { color: #00e676 !important; }

        .spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          vertical-align: middle;
          margin-right: 6px;
        }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      </style>

      <div class="section-title">Güvenli Rota Planlama</div>

      <div class="points-container">
        <div class="point-row point-start">
          <div class="point-marker">A</div>
          <div class="point-info">
            <div class="point-label">Başlangıç</div>
            <div class="point-coords">Seçilmedi</div>
          </div>
        </div>
        <div class="point-line"></div>
        <div class="point-row point-end">
          <div class="point-marker">B</div>
          <div class="point-info">
            <div class="point-label">Hedef (Kurtarma Noktası)</div>
            <div class="point-coords">Seçilmedi</div>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn-select btn-select-start">📍 Başlangıç Seç</button>
        <button class="btn-select btn-select-end">🏁 Hedef Seç</button>
      </div>

      <button class="btn-calculate" disabled>🛰️ Güvenli Rota Hesapla</button>
      <button class="btn-clear">Rotayı Temizle</button>

      <div class="route-details"></div>
    `;
  }
}

customElements.define('tua-route-planner', TuaRoutePlanner);
export default TuaRoutePlanner;
