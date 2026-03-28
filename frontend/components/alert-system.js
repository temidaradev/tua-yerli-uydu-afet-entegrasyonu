/**
 * TUA Alert System — Bildirim ve uyarı bileşeni
 * Toast notification ve acil durum uyarıları.
 */
import { eventBus, Events } from '../services/event-bus.js';

class TuaAlertSystem extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._alerts = [];
    this._counter = 0;
  }

  connectedCallback() {
    this.render();
    this._bindEvents();
  }

  _bindEvents() {
    eventBus.on(Events.ALERT_SHOW, (data) => this._showAlert(data));
    eventBus.on(Events.ALERT_DISMISS, (id) => this._dismissAlert(id));
  }

  _showAlert({ type = 'info', title, message, duration = 5000 }) {
    const id = ++this._counter;
    const alert = { id, type, title, message };
    this._alerts.push(alert);
    this._renderAlerts();

    if (duration > 0) {
      setTimeout(() => this._dismissAlert(id), duration);
    }
  }

  _dismissAlert(id) {
    const el = this.shadowRoot.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add('dismissing');
      setTimeout(() => {
        this._alerts = this._alerts.filter(a => a.id !== id);
        this._renderAlerts();
      }, 300);
    }
  }

  _renderAlerts() {
    const container = this.shadowRoot.querySelector('.alert-container');
    if (!container) return;

    container.innerHTML = this._alerts.map(alert => `
      <div class="alert alert-${alert.type}" data-id="${alert.id}">
        <div class="alert-icon">${this._getIcon(alert.type)}</div>
        <div class="alert-content">
          <div class="alert-title">${alert.title}</div>
          ${alert.message ? `<div class="alert-message">${alert.message}</div>` : ''}
        </div>
        <button class="alert-close" data-dismiss="${alert.id}">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('.alert-close').forEach(btn => {
      btn.addEventListener('click', () => {
        this._dismissAlert(parseInt(btn.dataset.dismiss));
      });
    });
  }

  _getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
      danger: '🔴',
    };
    return icons[type] || icons.info;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
          max-width: 400px;
          width: 100%;
        }
        .alert-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .alert {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          pointer-events: all;
          animation: slideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .alert.dismissing {
          animation: slideOut 0.3s ease forwards;
        }
        .alert-success {
          background: rgba(0, 230, 118, 0.12);
          border-color: rgba(0, 230, 118, 0.3);
        }
        .alert-error, .alert-danger {
          background: rgba(255, 59, 59, 0.12);
          border-color: rgba(255, 59, 59, 0.3);
          animation: slideIn 0.35s ease, pulseGlow 2s ease-in-out infinite;
        }
        .alert-warning {
          background: rgba(255, 171, 0, 0.12);
          border-color: rgba(255, 171, 0, 0.3);
        }
        .alert-info {
          background: rgba(0, 212, 255, 0.1);
          border-color: rgba(0, 212, 255, 0.25);
        }
        .alert-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
          font-weight: 700;
        }
        .alert-success .alert-icon { background: rgba(0,230,118,0.2); color: #00e676; }
        .alert-error .alert-icon, .alert-danger .alert-icon { background: rgba(255,59,59,0.2); color: #ff3b3b; }
        .alert-warning .alert-icon { background: rgba(255,171,0,0.2); color: #ffab00; }
        .alert-info .alert-icon { background: rgba(0,212,255,0.2); color: #00d4ff; }
        .alert-content { flex: 1; min-width: 0; }
        .alert-title {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13px;
          color: #e8ecf4;
        }
        .alert-message {
          font-family: 'Inter', sans-serif;
          font-size: 12px;
          color: #8892b0;
          margin-top: 3px;
          line-height: 1.4;
        }
        .alert-close {
          background: none;
          border: none;
          color: #5a6380;
          cursor: pointer;
          font-size: 14px;
          padding: 2px 4px;
          border-radius: 4px;
          transition: all 0.2s;
          line-height: 1;
        }
        .alert-close:hover { color: #e8ecf4; background: rgba(255,255,255,0.05); }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(60px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes slideOut {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to   { opacity: 0; transform: translateX(60px) scale(0.9); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
          50% { box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(255,59,59,0.2); }
        }
      </style>
      <div class="alert-container"></div>
    `;
  }
}

customElements.define('tua-alert-system', TuaAlertSystem);
export default TuaAlertSystem;
