/**
 * TUA Analysis Dashboard — AI Analiz Sonuçları
 * Hasar yüzdesi, risk seviyesi, istatistikler.
 */
import { eventBus, Events } from '../services/event-bus.js';

class TuaAnalysisDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._visible = false;
  }

  connectedCallback() {
    this.render();
    this._bindEvents();
  }

  _bindEvents() {
    eventBus.on(Events.ANALYSIS_COMPLETE, (data) => {
      this._data = data;
      this._visible = true;
      this._updateDashboard();
    });
  }

  _updateDashboard() {
    if (!this._data) return;
    const panel = this.shadowRoot.querySelector('.dashboard');
    if (panel) panel.classList.add('visible');

    const { summary, hazards } = this._data;

    // Animate damage circle
    this._animateCircle(summary.damagePercentage);

    // Stats
    const statsEl = this.shadowRoot.querySelector('.stats-grid');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-card">
          <div class="stat-value">${summary.affectedAreaKm2}<small>km²</small></div>
          <div class="stat-label">Etkilenen Alan</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${summary.totalHazards}</div>
          <div class="stat-label">Tehlike Noktası</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${(summary.populationAffected / 1000).toFixed(1)}<small>K</small></div>
          <div class="stat-label">Etkilenen Nüfus</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${summary.buildingsDamaged}</div>
          <div class="stat-label">Hasarlı Bina</div>
        </div>
      `;
    }

    // Risk badge
    const riskEl = this.shadowRoot.querySelector('.risk-badge');
    if (riskEl) {
      const labels = { critical: 'KRİTİK', high: 'YÜKSEK', medium: 'ORTA', low: 'DÜŞÜK' };
      riskEl.textContent = labels[summary.riskLevel] || summary.riskLevel;
      riskEl.className = `risk-badge risk-${summary.riskLevel}`;
    }

    // Hazard list
    const listEl = this.shadowRoot.querySelector('.hazard-list');
    if (listEl) {
      const severityIcons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
      listEl.innerHTML = hazards.slice(0, 6).map(h => `
        <div class="hazard-item">
          <span class="hazard-severity">${severityIcons[h.severity] || '⚪'}</span>
          <span class="hazard-type">${h.type}</span>
          <span class="hazard-conf">${Math.round(h.confidence * 100)}%</span>
        </div>
      `).join('');
    }
  }

  _animateCircle(percentage) {
    const circle = this.shadowRoot.querySelector('.progress-ring-fill');
    const text = this.shadowRoot.querySelector('.circle-value');
    if (!circle || !text) return;

    const circumference = 2 * Math.PI * 52;
    circle.style.strokeDasharray = circumference;

    // Animate from 0
    let current = 0;
    const target = percentage;
    const duration = 1200;
    const start = performance.now();

    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      current = target * eased;

      const offset = circumference - (current / 100) * circumference;
      circle.style.strokeDashoffset = offset;
      text.textContent = `${Math.round(current)}%`;

      // Color based on percentage
      if (current > 60) circle.style.stroke = '#ff3b3b';
      else if (current > 35) circle.style.stroke = '#ffab00';
      else circle.style.stroke = '#00e676';

      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  toggle() {
    this._visible = !this._visible;
    const panel = this.shadowRoot.querySelector('.dashboard');
    if (panel) panel.classList.toggle('visible', this._visible);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: 'Inter', sans-serif;
        }
        .dashboard {
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
          max-height: 0;
          overflow: hidden;
        }
        .dashboard.visible {
          opacity: 1;
          transform: translateY(0);
          pointer-events: all;
          max-height: 800px;
        }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #00d4ff;
          margin-bottom: 14px;
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

        /* Damage Circle */
        .damage-circle-container {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 18px;
          padding: 16px;
          background: rgba(255,255,255,0.02);
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.04);
        }
        .circle-wrapper {
          position: relative;
          width: 110px;
          height: 110px;
          flex-shrink: 0;
        }
        .progress-ring {
          transform: rotate(-90deg);
          width: 110px;
          height: 110px;
        }
        .progress-ring-bg {
          fill: none;
          stroke: rgba(255,255,255,0.06);
          stroke-width: 8;
        }
        .progress-ring-fill {
          fill: none;
          stroke: #00e676;
          stroke-width: 8;
          stroke-linecap: round;
          transition: stroke 0.3s;
        }
        .circle-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }
        .circle-value {
          font-size: 22px;
          font-weight: 800;
          color: #e8ecf4;
          display: block;
        }
        .circle-label {
          font-size: 9px;
          color: #8892b0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .damage-info {
          flex: 1;
        }
        .damage-info h3 {
          font-size: 14px;
          font-weight: 700;
          color: #e8ecf4;
          margin-bottom: 6px;
        }
        .risk-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }
        .risk-critical { background: rgba(255,59,59,0.15); color: #ff3b3b; border: 1px solid rgba(255,59,59,0.3); }
        .risk-high { background: rgba(255,107,53,0.15); color: #ff6b35; border: 1px solid rgba(255,107,53,0.3); }
        .risk-medium { background: rgba(255,171,0,0.15); color: #ffab00; border: 1px solid rgba(255,171,0,0.3); }
        .risk-low { background: rgba(0,230,118,0.15); color: #00e676; border: 1px solid rgba(0,230,118,0.3); }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 18px;
        }
        .stat-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          border-radius: 10px;
          padding: 12px;
          text-align: center;
          transition: all 0.25s;
        }
        .stat-card:hover {
          border-color: rgba(0,212,255,0.2);
          background: rgba(0,212,255,0.03);
        }
        .stat-value {
          font-size: 20px;
          font-weight: 800;
          color: #e8ecf4;
          line-height: 1.2;
        }
        .stat-value small {
          font-size: 11px;
          font-weight: 500;
          color: #8892b0;
          margin-left: 2px;
        }
        .stat-label {
          font-size: 10px;
          color: #5a6380;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Hazard List */
        .hazard-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .hazard-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 12px;
          transition: background 0.2s;
        }
        .hazard-item:hover {
          background: rgba(255,255,255,0.03);
        }
        .hazard-severity { font-size: 10px; flex-shrink: 0; }
        .hazard-type { flex: 1; color: #e8ecf4; font-weight: 500; }
        .hazard-conf {
          font-size: 11px;
          color: #5a6380;
          font-family: 'JetBrains Mono', monospace;
        }
      </style>

      <div class="dashboard">
        <div class="section-title">AI Analiz Sonuçları</div>
        
        <div class="damage-circle-container">
          <div class="circle-wrapper">
            <svg class="progress-ring" viewBox="0 0 120 120">
              <circle class="progress-ring-bg" cx="60" cy="60" r="52"/>
              <circle class="progress-ring-fill" cx="60" cy="60" r="52"/>
            </svg>
            <div class="circle-text">
              <span class="circle-value">0%</span>
              <span class="circle-label">Hasar</span>
            </div>
          </div>
          <div class="damage-info">
            <h3>Hasar Oranı</h3>
            <span class="risk-badge risk-medium">ORTA</span>
          </div>
        </div>

        <div class="stats-grid"></div>

        <div class="section-title">Tespit Edilen Tehlikeler</div>
        <div class="hazard-list">
          <div class="hazard-item" style="color:#5a6380; font-style:italic; justify-content:center;">
            Analiz bekleniyor...
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('tua-analysis-dashboard', TuaAnalysisDashboard);
export default TuaAnalysisDashboard;
