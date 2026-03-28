/**
 * TUA App Shell — Ana layout container
 * Sidebar, header, harita alanı, component orchestration.
 */
import { eventBus, Events } from '../services/event-bus.js';

class TuaAppShell extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sidebarCollapsed = false;
  }

  connectedCallback() {
    this.render();
    this._bindEvents();
    this._showWelcome();
  }

  _bindEvents() {
    // Sidebar toggle
    this.shadowRoot.querySelector('.sidebar-toggle')?.addEventListener('click', () => {
      this._sidebarCollapsed = !this._sidebarCollapsed;
      this.shadowRoot.querySelector('.layout').classList.toggle('sidebar-collapsed', this._sidebarCollapsed);
      // Invalidate map size after transition
      setTimeout(() => eventBus.emit(Events.MAP_READY, {}), 350);
    });

    // Loading state
    eventBus.on(Events.LOADING_START, () => {
      this.shadowRoot.querySelector('.loading-indicator')?.classList.add('active');
    });
    eventBus.on(Events.LOADING_END, () => {
      this.shadowRoot.querySelector('.loading-indicator')?.classList.remove('active');
    });
  }

  _showWelcome() {
    setTimeout(() => {
      eventBus.emit(Events.ALERT_SHOW, {
        type: 'info',
        title: 'TUA Sistemi Hazır',
        message: 'Bölge seçip "Uydu Analizi Başlat" butonuna tıklayın.',
        duration: 6000,
      });
    }, 1500);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
        }

        .layout {
          display: grid;
          grid-template-columns: var(--sidebar-width, 340px) 1fr;
          grid-template-rows: var(--header-height, 60px) 1fr;
          height: 100%;
          transition: grid-template-columns 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .layout.sidebar-collapsed {
          grid-template-columns: 0px 1fr;
        }

        /* Header */
        .header {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          padding: 0 20px;
          background: rgba(6, 10, 30, 0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          z-index: 100;
          gap: 16px;
        }
        .sidebar-toggle {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.03);
          color: #8892b0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s;
          font-size: 16px;
        }
        .sidebar-toggle:hover { border-color: rgba(0,212,255,0.3); color: #00d4ff; }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #00d4ff, #a855f7);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 4px 16px rgba(0,212,255,0.2);
        }
        .logo-text {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 1.5px;
          background: linear-gradient(135deg, #00d4ff, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .logo-sub {
          font-size: 10px;
          color: #5a6380;
          letter-spacing: 0.5px;
          font-weight: 400;
        }

        .header-right {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .status-badge {
          padding: 5px 14px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .status-online {
          background: rgba(0,230,118,0.1);
          color: #00e676;
          border: 1px solid rgba(0,230,118,0.2);
        }
        .status-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #00e676;
          animation: pulse 2s infinite;
        }

        .loading-indicator {
          width: 100%;
          height: 2px;
          position: absolute;
          bottom: 0;
          left: 0;
          background: transparent;
          overflow: hidden;
        }
        .loading-indicator.active::after {
          content: '';
          display: block;
          width: 40%;
          height: 100%;
          background: linear-gradient(90deg, transparent, #00d4ff, #a855f7, transparent);
          animation: loadingSlide 1.5s ease infinite;
        }

        .header-time {
          font-size: 11px;
          color: #5a6380;
          font-family: 'JetBrains Mono', monospace;
        }

        /* Sidebar */
        .sidebar {
          background: rgba(10, 14, 39, 0.95);
          backdrop-filter: blur(16px);
          border-right: 1px solid rgba(255,255,255,0.04);
          overflow-y: auto;
          overflow-x: hidden;
          padding: 20px 16px;
          transition: opacity 0.3s, transform 0.3s;
        }
        .layout.sidebar-collapsed .sidebar {
          opacity: 0;
          transform: translateX(-20px);
          pointer-events: none;
        }

        /* Main content (map) */
        .main-content {
          position: relative;
          overflow: hidden;
        }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes loadingSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      </style>

      <div class="layout">
        <header class="header">
          <button class="sidebar-toggle">☰</button>
          <div class="logo">
            <div class="logo-icon">🛰️</div>
            <div>
              <div class="logo-text">TUA • BKZS</div>
              <div class="logo-sub">Bölgesel Konumlama ve Zamanlama Sistemi</div>
            </div>
          </div>
          <div class="header-right">
            <span class="header-time" id="headerTime"></span>
            <div class="status-badge status-online">
              <span class="status-dot"></span>
              AKTİF
            </div>
          </div>
          <div class="loading-indicator"></div>
        </header>

        <aside class="sidebar">
          <tua-control-panel></tua-control-panel>
          <tua-analysis-dashboard></tua-analysis-dashboard>
          <div style="margin-top: 16px;">
            <tua-route-planner></tua-route-planner>
          </div>
        </aside>

        <main class="main-content">
          <tua-satellite-map></tua-satellite-map>
        </main>
      </div>
    `;

    // Live clock
    const updateTime = () => {
      const el = this.shadowRoot.querySelector('#headerTime');
      if (el) {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  }
}

customElements.define('tua-app-shell', TuaAppShell);
export default TuaAppShell;
