/**
 * TUA Satellite Map — Leaflet.js entegreli harita bileşeni
 * Uydu görüntüsü, tehlike bölgeleri, kurtarma noktaları, rota çizimi.
 */
import { eventBus, Events } from '../services/event-bus.js';

class TuaSatelliteMap extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._map = null;
    this._layers = {
      satellite: null,
      hazardZones: null,
      hazardPoints: null,
      rescuePoints: null,
      route: null,
      altRoute: null,
      heatmap: null,
      startMarker: null,
      endMarker: null,
    };
    this._layerGroups = {};
  }

  connectedCallback() {
    this.render();
    // Wait for Leaflet to be available
    this._waitForLeaflet().then(() => this._initMap());
  }

  _waitForLeaflet() {
    return new Promise((resolve) => {
      if (window.L) return resolve();
      const interval = setInterval(() => {
        if (window.L) { clearInterval(interval); resolve(); }
      }, 100);
    });
  }

  _initMap() {
    const container = this.shadowRoot.querySelector('#map');
    if (!container || !window.L) return;

    // Create map
    this._map = L.map(container, {
      center: [39.925, 32.85], // Ankara
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    // Zoom control (sağ üst)
    L.control.zoom({ position: 'topright' }).addTo(this._map);

    // Satellite tile layer
    this._layers.satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri | TUA Uydu Analiz Sistemi',
        maxZoom: 19,
      }
    ).addTo(this._map);

    // Labels overlay
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, opacity: 0.7 }
    ).addTo(this._map);

    // Layer groups
    this._layerGroups.hazardZones = L.layerGroup().addTo(this._map);
    this._layerGroups.hazardPoints = L.layerGroup().addTo(this._map);
    this._layerGroups.rescuePoints = L.layerGroup().addTo(this._map);
    this._layerGroups.routes = L.layerGroup().addTo(this._map);
    this._layerGroups.markers = L.layerGroup().addTo(this._map);

    // Map click handler
    this._map.on('click', (e) => {
      eventBus.emit(Events.MAP_CLICK, { lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Crosshair cursor (for point selection — we'll keep default)
    eventBus.emit(Events.MAP_READY, { center: this._map.getCenter() });
    this._bindEvents();

    // Harita boyutunu güncelle
    setTimeout(() => this._map.invalidateSize(), 200);
    window.addEventListener('resize', () => {
      setTimeout(() => this._map?.invalidateSize(), 100);
    });
  }

  _bindEvents() {
    eventBus.on(Events.ANALYSIS_COMPLETE, (data) => this._renderAnalysis(data));
    eventBus.on(Events.ROUTE_READY, (data) => this._renderRoutes(data));
    eventBus.on(Events.ROUTE_CLEAR, () => this._clearRoutes());
    eventBus.on(Events.MAP_SET_VIEW, ({ center, zoom }) => {
      this._map?.setView(center, zoom || 13, { animate: true });
    });
    eventBus.on(Events.MAP_TOGGLE_LAYER, ({ layer, visible }) => {
      const lg = this._layerGroups[layer];
      if (lg) {
        if (visible) this._map.addLayer(lg);
        else this._map.removeLayer(lg);
      }
    });
    eventBus.on(Events.MAP_CLICK, (latlng) => {
      // Show marker where user clicked during route planning
      // (controlled from route-planner component)
    });
    eventBus.on(Events.REGION_SELECT, (region) => {
      const centers = {
        istanbul: [41.015, 28.979],
        ankara: [39.925, 32.85],
        izmir: [38.423, 27.143],
        antalya: [36.885, 30.71],
        bursa: [40.183, 29.061],
        hatay: [36.202, 36.16],
        kahramanmaras: [37.585, 36.937],
        adiyaman: [37.764, 38.276],
      };
      const center = centers[region];
      if (center) this._map?.setView(center, 13, { animate: true });
    });
  }

  _renderAnalysis(data) {
    this._clearAnalysis();
    if (!this._map || !data) return;

    const { hazardZones, hazards, rescuePoints, center } = data;

    // Haritayı analiz merkezine taşı
    if (center) this._map.setView(center, 14, { animate: true });

    // 1. Tehlike bölgeleri (polygon)
    if (hazardZones) {
      hazardZones.forEach(zone => {
        const colors = { critical: '#ff3b3b', high: '#ff6b35', medium: '#ffab00' };
        const color = colors[zone.risk] || '#ffab00';
        L.polygon(zone.polygon, {
          color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2,
          dashArray: zone.risk === 'critical' ? '' : '6 4',
          className: 'hazard-zone-pulse',
        }).bindPopup(`<b>Tehlike Bölgesi</b><br>Risk: ${zone.risk.toUpperCase()}`).addTo(this._layerGroups.hazardZones);
      });
    }

    // 2. Tehlike noktaları
    if (hazards) {
      hazards.forEach(h => {
        const severityColors = { critical: '#ff3b3b', high: '#ff6b35', medium: '#ffab00', low: '#00e676' };
        const color = severityColors[h.severity] || '#ffab00';

        // Custom circle marker
        const marker = L.circleMarker(h.location, {
          radius: 7,
          fillColor: color,
          fillOpacity: 0.8,
          color: 'white',
          weight: 1.5,
        }).bindPopup(`
          <div style="font-family:Inter,sans-serif;">
            <b style="color:${color}">${h.type}</b><br>
            <span style="font-size:11px;">Şiddet: ${h.severity.toUpperCase()}</span><br>
            <span style="font-size:11px;">Güven: ${Math.round(h.confidence * 100)}%</span>
          </div>
        `).addTo(this._layerGroups.hazardPoints);

        // Radius circle
        if (h.radius > 100) {
          L.circle(h.location, {
            radius: h.radius,
            color,
            fillColor: color,
            fillOpacity: 0.06,
            weight: 1,
            dashArray: '4 4',
          }).addTo(this._layerGroups.hazardPoints);
        }
      });
    }

    // 3. Kurtarma noktaları
    if (rescuePoints) {
      rescuePoints.forEach(rp => {
        const statusColors = { active: '#00e676', preparing: '#ffab00' };
        const color = statusColors[rp.status] || '#00e676';

        // Custom DivIcon for rescue points
        const icon = L.divIcon({
          html: `<div style="
            width:32px;height:32px;
            background:${color};
            border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            font-size:16px;
            box-shadow:0 0 16px ${color}80, 0 2px 8px rgba(0,0,0,0.4);
            border:2px solid white;
            animation: pulseMarker 2s infinite;
          ">🏥</div>`,
          className: 'rescue-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        L.marker(rp.location, { icon }).bindPopup(`
          <div style="font-family:Inter,sans-serif;">
            <b style="color:${color}">${rp.name}</b><br>
            <span style="font-size:11px;">Kapasite: ${rp.capacity} kişi</span><br>
            <span style="font-size:11px;">Durum: ${rp.status === 'active' ? '✅ Aktif' : '⏳ Hazırlanıyor'}</span>
          </div>
        `).addTo(this._layerGroups.rescuePoints);
      });
    }
  }

  _renderRoutes(data) {
    this._clearRoutes();
    if (!this._map || !data) return;

    // Alternative route (daha kalın, soluk)
    if (data.alternative?.waypoints) {
      const altLine = L.polyline(data.alternative.waypoints, {
        color: '#ffab00',
        weight: 4,
        opacity: 0.4,
        dashArray: '8 6',
        lineCap: 'round',
      }).bindPopup('Alternatif Rota').addTo(this._layerGroups.routes);
    }

    // Primary route (animasyonlu)
    if (data.primary?.waypoints) {
      // Background line
      L.polyline(data.primary.waypoints, {
        color: '#00e676',
        weight: 5,
        opacity: 0.25,
        lineCap: 'round',
      }).addTo(this._layerGroups.routes);

      // Animated line
      this._animateRoute(data.primary.waypoints);

      // Start marker
      const startIcon = L.divIcon({
        html: `<div style="width:24px;height:24px;background:#00e676;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#0a0e27;box-shadow:0 0 12px rgba(0,230,118,0.5);border:2px solid white;">A</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker(data.primary.waypoints[0], { icon: startIcon }).addTo(this._layerGroups.routes);

      // End marker
      const endIcon = L.divIcon({
        html: `<div style="width:24px;height:24px;background:#ff3b3b;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:white;box-shadow:0 0 12px rgba(255,59,59,0.5);border:2px solid white;">B</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker(data.primary.waypoints[data.primary.waypoints.length - 1], { icon: endIcon }).addTo(this._layerGroups.routes);

      // Fit bounds
      const bounds = L.latLngBounds(data.primary.waypoints);
      this._map.fitBounds(bounds.pad(0.15), { animate: true });
    }
  }

  _animateRoute(waypoints) {
    let index = 0;
    const animatedCoords = [];
    let polyline = null;

    const step = () => {
      if (index >= waypoints.length) return;
      animatedCoords.push(waypoints[index]);

      if (polyline) this._layerGroups.routes.removeLayer(polyline);
      polyline = L.polyline(animatedCoords, {
        color: '#00e676',
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(this._layerGroups.routes);

      index++;
      setTimeout(step, 80);
    };
    step();
  }

  _clearAnalysis() {
    Object.values(this._layerGroups).forEach(lg => lg?.clearLayers());
  }

  _clearRoutes() {
    this._layerGroups.routes?.clearLayers();
    this._layerGroups.markers?.clearLayers();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          position: relative;
        }
        #map {
          width: 100%;
          height: 100%;
          border-radius: 0;
        }

        /* Scan overlay */
        .scan-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          z-index: 500;
          opacity: 0;
          transition: opacity 0.5s;
        }
        .scan-overlay.active {
          opacity: 1;
        }
        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent);
          box-shadow: 0 0 20px rgba(0,212,255,0.4);
          animation: scanLine 3s linear infinite;
        }

        /* Map info overlay */
        .map-info {
          position: absolute;
          bottom: 32px;
          left: 12px;
          z-index: 600;
          background: rgba(6, 10, 30, 0.8);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          padding: 10px 14px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #8892b0;
          display: flex;
          gap: 16px;
        }
        .map-info span { color: #00d4ff; font-weight: 600; }

        /* Coordinates display */
        .coords-display {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 600;
          background: rgba(6, 10, 30, 0.85);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(0,212,255,0.15);
          border-radius: 8px;
          padding: 8px 14px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #00d4ff;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .coords-display::before {
          content: '📡';
          font-size: 13px;
        }

        @keyframes scanLine {
          0%   { top: 0; }
          100% { top: 100%; }
        }
        @keyframes pulseMarker {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      </style>

      <div id="map"></div>
      <div class="coords-display">
        <span id="coords">39.9250°N, 32.8500°E</span>
      </div>
      <div class="scan-overlay" id="scanOverlay">
        <div class="scan-line"></div>
      </div>
      <div class="map-info">
        Kaynak: <span>Esri Satellite</span> &nbsp;|&nbsp; Sistem: <span>TUA-BKZS v1.0</span>
      </div>
    `;

    // Leaflet CSS import (into shadow DOM)
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    this.shadowRoot.prepend(leafletCSS);
  }
}

customElements.define('tua-satellite-map', TuaSatelliteMap);
export default TuaSatelliteMap;
