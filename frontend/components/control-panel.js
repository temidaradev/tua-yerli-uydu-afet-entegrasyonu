/**
 * TUA Control Panel — Sol panel kontrolleri
 * Afet tipi seçimi, analiz başlatma, katman kontrolleri, bölge seçimi.
 */
import { eventBus, Events } from '../services/event-bus.js';
import { apiService } from '../services/api-service.js';

class TuaControlPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._disasterType = 'earthquake';
    this._isAnalyzing = false;
    this._progress = 0;
    this._selectedRegion = 'ankara';
  }

  connectedCallback() {
    this.render();
    this._bindEvents();
  }

  _bindEvents() {
    // Disaster type selection
    this.shadowRoot.querySelectorAll('.disaster-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._disasterType = btn.dataset.type;
        this.shadowRoot.querySelectorAll('.disaster-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        eventBus.emit(Events.DISASTER_TYPE_CHANGE, this._disasterType);
      });
    });

    // Region selection
    this.shadowRoot.querySelector('#regionSelect')?.addEventListener('change', (e) => {
      this._selectedRegion = e.target.value;
      eventBus.emit(Events.REGION_SELECT, this._selectedRegion);
    });

    // Analyze button
    this.shadowRoot.querySelector('.btn-analyze')?.addEventListener('click', () => this._startAnalysis());

    // Layer toggles
    this.shadowRoot.querySelectorAll('.layer-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        eventBus.emit(Events.MAP_TOGGLE_LAYER, {
          layer: e.target.dataset.layer,
          visible: e.target.checked,
        });
      });
    });

    // Progress updates
    eventBus.on(Events.ANALYSIS_PROGRESS, ({ progress, message }) => {
      this._progress = progress;
      this._updateProgress(progress, message);
    });

    eventBus.on(Events.ANALYSIS_COMPLETE, () => {
      this._isAnalyzing = false;
      this._updateProgress(100, 'Analiz tamamlandı!');
      setTimeout(() => {
        const progContainer = this.shadowRoot.querySelector('.progress-container');
        if (progContainer) progContainer.classList.remove('visible');
      }, 2000);
      const btn = this.shadowRoot.querySelector('.btn-analyze');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🛰️ Analizi Yeniden Başlat';
      }
    });
  }

  async _startAnalysis() {
    if (this._isAnalyzing) return;
    this._isAnalyzing = true;

    const btn = this.shadowRoot.querySelector('.btn-analyze');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Analiz Ediliyor...';
    }

    const progContainer = this.shadowRoot.querySelector('.progress-container');
    if (progContainer) progContainer.classList.add('visible');

    const regions = {
      istanbul: [41.015, 28.979],
      ankara: [39.925, 32.85],
      izmir: [38.423, 27.143],
      antalya: [36.885, 30.71],
      bursa: [40.183, 29.061],
      hatay: [36.202, 36.16],
      kahramanmaras: [37.585, 36.937],
      adiyaman: [37.764, 38.276],
    };

    await apiService.startAnalysis({
      disasterType: this._disasterType,
      center: regions[this._selectedRegion] || regions.ankara,
      region: this._selectedRegion,
    });
  }

  _updateProgress(progress, message) {
    const bar = this.shadowRoot.querySelector('.progress-bar-fill');
    const text = this.shadowRoot.querySelector('.progress-text');
    const pct = this.shadowRoot.querySelector('.progress-pct');
    if (bar) bar.style.width = `${progress}%`;
    if (text) text.textContent = message;
    if (pct) pct.textContent = `${Math.round(progress)}%`;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: 'Inter', sans-serif;
        }

        .section {
          margin-bottom: 20px;
        }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #00d4ff;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .section-title::before {
          content: '';
          width: 3px;
          height: 14px;
          background: linear-gradient(180deg, #00d4ff, #a855f7);
          border-radius: 2px;
        }

        /* Region Select */
        .select-wrapper {
          position: relative;
          margin-bottom: 16px;
        }
        select {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: #e8ecf4;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          cursor: pointer;
          appearance: none;
          outline: none;
          transition: all 0.25s;
        }
        select:focus { border-color: rgba(0,212,255,0.4); box-shadow: 0 0 0 3px rgba(0,212,255,0.1); }
        select option { background: #141937; color: #e8ecf4; }
        .select-arrow {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #5a6380;
          pointer-events: none;
          font-size: 11px;
        }

        /* Disaster Type Buttons */
        .disaster-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 16px;
        }
        .disaster-btn {
          padding: 12px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          color: #8892b0;
          cursor: pointer;
          transition: all 0.25s;
          text-align: center;
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 500;
        }
        .disaster-btn:hover {
          border-color: rgba(0,212,255,0.2);
          background: rgba(0,212,255,0.04);
          color: #e8ecf4;
        }
        .disaster-btn.active {
          border-color: rgba(0,212,255,0.4);
          background: rgba(0,212,255,0.08);
          color: #00d4ff;
          box-shadow: 0 0 16px rgba(0,212,255,0.08);
        }
        .disaster-icon {
          font-size: 22px;
          display: block;
          margin-bottom: 6px;
        }

        /* Analyze Button */
        .btn-analyze {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #00d4ff, #0099cc);
          color: white;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          letter-spacing: 0.3px;
          margin-bottom: 12px;
          position: relative;
          overflow: hidden;
        }
        .btn-analyze::before {
          content: '';
          position: absolute;
          top: 0; left: -100%; width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          transition: left 0.6s;
        }
        .btn-analyze:hover:not(:disabled)::before { left: 100%; }
        .btn-analyze:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(0,212,255,0.25);
        }
        .btn-analyze:active:not(:disabled) { transform: translateY(0); }
        .btn-analyze:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .spinner {
          display: inline-block;
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          vertical-align: middle;
          margin-right: 8px;
        }

        /* Progress */
        .progress-container {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.4s cubic-bezier(0.22, 1, 0.36, 1);
          margin-bottom: 4px;
        }
        .progress-container.visible { max-height: 80px; margin-bottom: 16px; }
        .progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .progress-text { font-size: 11px; color: #8892b0; }
        .progress-pct { font-size: 11px; font-weight: 700; color: #00d4ff; font-family: 'JetBrains Mono', monospace; }
        .progress-bar {
          width: 100%;
          height: 4px;
          border-radius: 4px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          width: 0%;
          border-radius: 4px;
          background: linear-gradient(90deg, #00d4ff, #a855f7);
          transition: width 0.3s ease;
          box-shadow: 0 0 12px rgba(0,212,255,0.4);
        }

        /* Layer Toggles */
        .layer-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .layer-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          transition: background 0.2s;
          cursor: pointer;
        }
        .layer-item:hover { background: rgba(255,255,255,0.03); }
        .layer-item label {
          flex: 1;
          font-size: 12px;
          color: #e8ecf4;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .layer-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }

        /* Custom toggle switch */
        .toggle-switch {
          appearance: none;
          width: 36px;
          height: 20px;
          background: rgba(255,255,255,0.08);
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          transition: background 0.25s;
          flex-shrink: 0;
        }
        .toggle-switch::after {
          content: '';
          position: absolute;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: #5a6380;
          top: 3px; left: 3px;
          transition: all 0.25s;
        }
        .toggle-switch:checked {
          background: rgba(0,212,255,0.2);
        }
        .toggle-switch:checked::after {
          left: 19px;
          background: #00d4ff;
          box-shadow: 0 0 8px rgba(0,212,255,0.4);
        }

        .divider {
          height: 1px;
          background: rgba(255,255,255,0.04);
          margin: 16px 0;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      </style>

      <div class="section">
        <div class="section-title">Bölge Seçimi</div>
        <div class="select-wrapper">
          <select id="regionSelect">
            <option value="ankara">🏛️ Ankara</option>
            <option value="istanbul">🌉 İstanbul</option>
            <option value="izmir">🏖️ İzmir</option>
            <option value="hatay">🏔️ Hatay</option>
            <option value="kahramanmaras">🏔️ Kahramanmaraş</option>
            <option value="adiyaman">🏔️ Adıyaman</option>
            <option value="antalya">☀️ Antalya</option>
            <option value="bursa">🌿 Bursa</option>
          </select>
          <span class="select-arrow">▼</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Afet Tipi</div>
        <div class="disaster-grid">
          <button class="disaster-btn active" data-type="earthquake">
            <span class="disaster-icon">🌍</span>
            Deprem
          </button>
          <button class="disaster-btn" data-type="flood">
            <span class="disaster-icon">🌊</span>
            Sel
          </button>
          <button class="disaster-btn" data-type="fire">
            <span class="disaster-icon">🔥</span>
            Yangın
          </button>
          <button class="disaster-btn" data-type="landslide">
            <span class="disaster-icon">⛰️</span>
            Heyelan
          </button>
        </div>
      </div>

      <button class="btn-analyze">🛰️ Uydu Analizi Başlat</button>

      <div class="progress-container">
        <div class="progress-header">
          <span class="progress-text">Bekleniyor...</span>
          <span class="progress-pct">0%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill"></div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="section">
        <div class="section-title">Harita Katmanları</div>
        <div class="layer-list">
          <div class="layer-item">
            <label><span class="layer-dot" style="background:#ff3b3b"></span> Tehlike Bölgeleri</label>
            <input type="checkbox" class="toggle-switch layer-toggle" data-layer="hazardZones" checked>
          </div>
          <div class="layer-item">
            <label><span class="layer-dot" style="background:#ff6b35"></span> Tehlike Noktaları</label>
            <input type="checkbox" class="toggle-switch layer-toggle" data-layer="hazardPoints" checked>
          </div>
          <div class="layer-item">
            <label><span class="layer-dot" style="background:#00e676"></span> Kurtarma Noktaları</label>
            <input type="checkbox" class="toggle-switch layer-toggle" data-layer="rescuePoints" checked>
          </div>
          <div class="layer-item">
            <label><span class="layer-dot" style="background:#00d4ff"></span> Güvenli Rota</label>
            <input type="checkbox" class="toggle-switch layer-toggle" data-layer="routes" checked>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('tua-control-panel', TuaControlPanel);
export default TuaControlPanel;
