/**
 * TUA Event Bus — Componentler arası iletişim
 * Pub/Sub pattern ile loose coupling sağlar.
 */
class TuaEventBus {
  constructor() {
    this._listeners = new Map();
    this._eventLog = [];
  }

  /**
   * Bir olaya abone ol
   * @param {string} event - Olay adı
   * @param {Function} callback - Callback fonksiyonu
   * @returns {Function} Unsubscribe fonksiyonu
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    
    // Unsubscribe fonksiyonu döndür
    return () => this.off(event, callback);
  }

  /**
   * Bir olaydan aboneliği kaldır
   */
  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Bir kez dinle, sonra otomatik abonelikten çık
   */
  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Olay yayınla
   * @param {string} event - Olay adı
   * @param {*} data - Gönderilecek veri
   */
  emit(event, data) {
    this._eventLog.push({ event, data, timestamp: Date.now() });
    // Son 100 olayı tut
    if (this._eventLog.length > 100) {
      this._eventLog.shift();
    }

    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[EventBus] "${event}" handler hatası:`, err);
        }
      });
    }
  }

  /**
   * Tüm abonelikleri temizle
   */
  clear() {
    this._listeners.clear();
  }

  /**
   * Son olayları getir (debug)
   */
  getLog() {
    return [...this._eventLog];
  }
}

// -------- Olay Sabitleri --------
export const Events = {
  // Analiz
  ANALYSIS_START: 'analysis:start',
  ANALYSIS_PROGRESS: 'analysis:progress',
  ANALYSIS_COMPLETE: 'analysis:complete',
  ANALYSIS_ERROR: 'analysis:error',

  // Rota
  ROUTE_CALCULATE: 'route:calculate',
  ROUTE_READY: 'route:ready',
  ROUTE_CLEAR: 'route:clear',

  // Harita
  MAP_READY: 'map:ready',
  MAP_CLICK: 'map:click',
  MAP_SET_VIEW: 'map:setView',
  MAP_ADD_LAYER: 'map:addLayer',
  MAP_REMOVE_LAYER: 'map:removeLayer',
  MAP_TOGGLE_LAYER: 'map:toggleLayer',

  // Kontrol paneli
  DISASTER_TYPE_CHANGE: 'control:disasterType',
  LAYER_TOGGLE: 'control:layerToggle',
  REGION_SELECT: 'control:regionSelect',

  // Uyarı sistemi
  ALERT_SHOW: 'alert:show',
  ALERT_DISMISS: 'alert:dismiss',

  // Genel
  LOADING_START: 'loading:start',
  LOADING_END: 'loading:end',
  THEME_CHANGE: 'theme:change',
};

// Singleton instance
export const eventBus = new TuaEventBus();
export default eventBus;
