import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { API_BASE_URL } from '../../config';
import { environment } from '../../../environments/environment';
import { TranslationService } from '../../service/translation.service';

interface Waypoint {
  name: string;
}

export interface RouteMapNode {
  name: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
  type: 'origin' | 'waypoint' | 'destination' | 'toll';
  kmFromStart: number;
  highway: string;
}

interface RouteAlternative {
  id: string;
  name: string;
  via: string;
  distanceKm: number;
  durationHours: number;
  tollCount: number;
  roadType: string;
  trafficStatus: string;
  trafficColor: string;
  recommended: boolean;
}

interface SavedRouteItem {
  _id?: string;
  routeName: string;
  origin: { name: string; lat?: number; lng?: number };
  destination: { name: string; lat?: number; lng?: number };
  waypoints: { name: string; lat?: number; lng?: number }[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
  createdAt?: string;
}

// Accurate geographical coordinates for Indian cities and stops
const CITY_COORDINATES: Record<string, { lat: number; lng: number; highway: string }> = {
  delhi: { lat: 28.6139, lng: 77.2090, highway: 'NH-48 / NH-44' },
  jaipur: { lat: 26.9124, lng: 75.7873, highway: 'NH-48 (Delhi-Jaipur Expy)' },
  agra: { lat: 27.1767, lng: 78.0081, highway: 'Yamuna Expressway' },
  mumbai: { lat: 19.0760, lng: 72.8777, highway: 'Mumbai-Pune Expressway' },
  pune: { lat: 18.5204, lng: 73.8567, highway: 'NH-48' },
  goa: { lat: 15.2993, lng: 74.1240, highway: 'NH-66 Coastal Corridor' },
  bangalore: { lat: 12.9716, lng: 77.5946, highway: 'NH-44 / NH-275' },
  mysore: { lat: 12.2958, lng: 76.6394, highway: 'NH-275 Bengaluru-Mysuru Expy' },
  chennai: { lat: 13.0827, lng: 80.2707, highway: 'ECR / NH-32' },
  pondicherry: { lat: 11.9416, lng: 79.8083, highway: 'East Coast Road (ECR)' },
  kolkata: { lat: 22.5726, lng: 88.3639, highway: 'NH-12 / NH-19' },
  darjeeling: { lat: 27.0410, lng: 88.2663, highway: 'NH-110 Hill Cart Road' },
  hyderabad: { lat: 17.3850, lng: 78.4867, highway: 'NH-44 / NH-65' },
  lucknow: { lat: 26.8467, lng: 80.9462, highway: 'Agra-Lucknow Expressway' },
  chandigarh: { lat: 30.7333, lng: 76.7794, highway: 'NH-44 Grand Trunk Rd' },
  neemrana: { lat: 27.9888, lng: 76.3883, highway: 'NH-48' },
  mathura: { lat: 27.4924, lng: 77.6737, highway: 'NH-19' },
  udaipur: { lat: 24.5854, lng: 73.7125, highway: 'NH-48' },
  shimla: { lat: 31.1048, lng: 77.1734, highway: 'NH-5 Himalayan Expy' },
  manali: { lat: 32.2432, lng: 77.1892, highway: 'NH-3' },
  hubli: { lat: 15.3647, lng: 75.1240, highway: 'NH-48' },
  chitradurga: { lat: 14.2251, lng: 76.3980, highway: 'NH-48' },
  nashik: { lat: 19.9975, lng: 73.7898, highway: 'NH-160' },
  siliguri: { lat: 26.7271, lng: 88.3953, highway: 'NH-27' },
};

// Real Indian inter-city distances in km
const CITY_DISTANCE_MAP: Record<string, Record<string, number>> = {
  Delhi: { Jaipur: 270, Agra: 200, Mumbai: 1400, Pune: 1470, Bangalore: 2100, Chennai: 2180, Kolkata: 1480, Hyderabad: 1570, Goa: 1900, Mysore: 2200, Darjeeling: 1660, Pondicherry: 2350, Lucknow: 555, Chandigarh: 245 },
  Mumbai: { Delhi: 1400, Pune: 148, Goa: 590, Bangalore: 980, Chennai: 1330, Hyderabad: 710, Kolkata: 1980, Jaipur: 1150, Agra: 1280, Mysore: 1100, Nagpur: 870 },
  Bangalore: { Delhi: 2100, Mumbai: 980, Chennai: 345, Hyderabad: 570, Goa: 560, Mysore: 145, Pune: 840, Kolkata: 1870, Jaipur: 1950, Pondicherry: 310, Coimbatore: 360 },
  Kolkata: { Delhi: 1480, Mumbai: 1980, Bangalore: 1870, Chennai: 1660, Hyderabad: 1490, Darjeeling: 600, Patna: 550, Bhubaneswar: 440 },
  Chennai: { Delhi: 2180, Mumbai: 1330, Bangalore: 345, Hyderabad: 625, Pondicherry: 160, Coimbatore: 495, Mysore: 475, Kolkata: 1660, Goa: 870 },
  Hyderabad: { Delhi: 1570, Mumbai: 710, Bangalore: 570, Chennai: 625, Pune: 560, Goa: 680, Kolkata: 1490, Vijayawada: 265 },
  Jaipur: { Delhi: 270, Agra: 240, Mumbai: 1150, Jodhpur: 335, Ajmer: 135, Udaipur: 420 },
  Agra: { Delhi: 200, Jaipur: 240, Lucknow: 355, Kanpur: 290 },
  Goa: { Mumbai: 590, Bangalore: 560, Hyderabad: 680, Pune: 450, Chennai: 870 },
  Mysore: { Bangalore: 145, Chennai: 475, Coimbatore: 215, Ooty: 120 },
  Darjeeling: { Kolkata: 600, Siliguri: 75, Gangtok: 100 },
  Pondicherry: { Chennai: 160, Bangalore: 310, Mysore: 495 },
  Pune: { Mumbai: 148, Goa: 450, Bangalore: 840, Hyderabad: 560, Nashik: 210 },
  Lucknow: { Delhi: 555, Agra: 355, Kanpur: 80, Varanasi: 285, Allahabad: 215 },
  Chandigarh: { Delhi: 245, Shimla: 110, Amritsar: 225 },
};

const ROUTE_ALTERNATIVES: Record<string, { name: string; via: string; roadType: string; tollMultiplier: number; speedKmh: number; trafficStatus: string; trafficColor: string; recommended: boolean }[]> = {
  expressway: [
    { name: 'National Expressway (Fastest)', via: 'Via National Highway Expressway', roadType: 'Access-Controlled 6-Lane Expressway', tollMultiplier: 1.0, speedKmh: 100, trafficStatus: 'Normal Flow', trafficColor: 'green', recommended: true },
    { name: 'State Highway Corridor', via: 'Via Heritage State Highway', roadType: '4-Lane National & State Highway', tollMultiplier: 0.3, speedKmh: 70, trafficStatus: 'Moderate Road Activity', trafficColor: 'amber', recommended: false },
  ],
  highway: [
    { name: 'NH Direct Route', via: 'Via National Highway (Direct)', roadType: '4-Lane National Highway', tollMultiplier: 1.0, speedKmh: 75, trafficStatus: 'Normal Flow', trafficColor: 'green', recommended: true },
    { name: 'Bypass-Scenic Route', via: 'Via Bypass & Scenic Road', roadType: '2-Lane State Highway', tollMultiplier: 0.2, speedKmh: 55, trafficStatus: 'Light Traffic', trafficColor: 'green', recommended: false },
    { name: 'City-to-City Local Roads', via: 'Via City Centres & Local Roads', roadType: 'Mixed Urban & Rural Roads', tollMultiplier: 0.0, speedKmh: 45, trafficStatus: 'Heavy Traffic', trafficColor: 'red', recommended: false },
  ],
};

@Component({
  selector: 'app-route-planner',
  templateUrl: './route-planner.component.html',
  styleUrl: './route-planner.component.css'
})
export class RoutePlannerComponent implements OnInit, OnDestroy {
  origin: string = 'Delhi';
  destination: string = 'Jaipur';
  waypoints: Waypoint[] = [];

  isCalculating: boolean = false;
  isRefreshingTraffic: boolean = false;
  hasCalculated: boolean = false;
  alternatives: RouteAlternative[] = [];
  selectedAlternativeId: string = 'alt-1';
  saveFeedback: string = '';
  isSaved: boolean = false;
  lastRefreshedAt: string = '';
  trafficRefreshBanner: string = '';

  savedRoutes: SavedRouteItem[] = [];
  isSaving: boolean = false;

  originCities: string[] = ['Delhi', 'Mumbai', 'Bangalore', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune', 'Jaipur'];
  destinationCities: string[] = ['Jaipur', 'Agra', 'Goa', 'Mysore', 'Darjeeling', 'Pondicherry', 'Lucknow', 'Chandigarh'];

  totalDistanceKm: number = 0;
  totalDurationHours: number = 0;
  totalTolls: number = 0;
  routeNotFound: boolean = false;

  // Interactive Map Visualizer State
  mapProvider: string = environment.mapProvider || 'osm-vector-hybrid';
  mapStyle: 'standard' | 'satellite' | 'terrain' = 'standard';
  mapZoom: number = 1;
  mapNodes: RouteMapNode[] = [];
  tollNodes: RouteMapNode[] = [];
  selectedMapNode: RouteMapNode | null = null;
  primarySvgPath: string = '';
  secondarySvgPath: string = '';
  scenicSvgPath: string = '';

  // Real Leaflet Map Instance & Layers
  leafletAvailable: boolean = typeof window !== 'undefined' && !!(window as any).L;
  private leafletMap: any = null;
  private leafletTileLayer: any = null;
  private leafletRouteGroup: any = null;
  private osrmAlternativesCoords: [number, number][][] = [];

  constructor(
    private http: HttpClient,
    private router: Router,
    private ngZone: NgZone,
    public translationService: TranslationService
  ) {}

  ngOnInit(): void {
    this.leafletAvailable = typeof window !== 'undefined' && !!(window as any).L;
    this.calculateRoute();
    this.loadSavedRoutes();
  }

  ngOnDestroy(): void {
    if (this.leafletMap) {
      try {
        this.leafletMap.remove();
      } catch (_) {}
      this.leafletMap = null;
    }
  }

  resolveCoords(cityName: string): { lat: number; lng: number; highway: string } {
    const clean = (cityName || '').trim().toLowerCase();
    if (CITY_COORDINATES[clean]) {
      return CITY_COORDINATES[clean];
    }
    const foundKey = Object.keys(CITY_COORDINATES).find(k => clean.includes(k) || k.includes(clean));
    if (foundKey) {
      return CITY_COORDINATES[foundKey];
    }
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = (hash * 31 + clean.charCodeAt(i)) % 1000;
    }
    return {
      lat: Number((16 + (hash % 140) / 10).toFixed(4)),
      lng: Number((74 + ((hash * 7) % 130) / 10).toFixed(4)),
      highway: 'NH-44 Corridor'
    };
  }

  addWaypoint(): void {
    if (this.waypoints.length >= 4) {
      return;
    }
    this.waypoints.push({ name: '' });
  }

  removeWaypoint(index: number): void {
    this.waypoints.splice(index, 1);
    this.calculateRoute();
  }

  selectOriginCity(city: string): void {
    this.origin = city;
    this.isSaved = false;
    this.calculateRoute();
  }

  selectDestCity(city: string): void {
    this.destination = city;
    this.isSaved = false;
    this.calculateRoute();
  }

  getDistance(from: string, to: string): number {
    const fromKey = Object.keys(CITY_DISTANCE_MAP).find(k => k.toLowerCase() === from.toLowerCase());
    if (fromKey) {
      const toKey = Object.keys(CITY_DISTANCE_MAP[fromKey] || {}).find(k => k.toLowerCase() === to.toLowerCase());
      if (toKey && CITY_DISTANCE_MAP[fromKey][toKey]) {
        return CITY_DISTANCE_MAP[fromKey][toKey];
      }
    }
    // Haversine road approximation from coordinates
    const c1 = this.resolveCoords(from);
    const c2 = this.resolveCoords(to);
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(c2.lat - c1.lat);
    const dLng = toRad(c2.lng - c1.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(c1.lat)) * Math.cos(toRad(c2.lat)) * Math.sin(dLng / 2) ** 2;
    const straightKm = 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(30, Math.round(straightKm * 1.22));
  }

  /**
   * Builds projected SVG coordinates and curved highway polylines for the interactive map canvas
   */
  buildInteractiveMapGeometry(stops: string[], segmentDistances: number[]): void {
    const rawCoords = stops.map((s, idx) => {
      const c = this.resolveCoords(s);
      const kmFromStart = segmentDistances.slice(0, idx).reduce((acc, v) => acc + v, 0);
      return {
        name: s,
        lat: c.lat,
        lng: c.lng,
        type: (idx === 0 ? 'origin' : idx === stops.length - 1 ? 'destination' : 'waypoint') as 'origin' | 'waypoint' | 'destination',
        kmFromStart,
        highway: c.highway
      };
    });

    const lats = rawCoords.map(c => c.lat);
    const lngs = rawCoords.map(c => c.lng);
    const minLat = Math.min(...lats) - 0.8;
    const maxLat = Math.max(...lats) + 0.8;
    const minLng = Math.min(...lngs) - 1.0;
    const maxLng = Math.max(...lngs) + 1.0;

    const latSpan = Math.max(1.5, maxLat - minLat);
    const lngSpan = Math.max(1.5, maxLng - minLng);

    // Canvas padding: width 760 (x: 90..710), height 320 (y: 55..265)
    this.mapNodes = rawCoords.map((rc) => {
      const nx = (rc.lng - minLng) / lngSpan;
      const ny = 1 - (rc.lat - minLat) / latSpan;
      return {
        ...rc,
        x: Math.round(110 + nx * 540),
        y: Math.round(60 + ny * 200)
      };
    });

    // Build smooth primary polyline path through all stops
    if (this.mapNodes.length >= 2) {
      let primary = `M ${this.mapNodes[0].x} ${this.mapNodes[0].y}`;
      let secondary = `M ${this.mapNodes[0].x} ${this.mapNodes[0].y}`;
      let scenic = `M ${this.mapNodes[0].x} ${this.mapNodes[0].y}`;
      const tolls: RouteMapNode[] = [];

      for (let i = 0; i < this.mapNodes.length - 1; i++) {
        const p1 = this.mapNodes[i];
        const p2 = this.mapNodes[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        // Perpendicular offset for curve separation
        const len = Math.max(1, Math.hypot(dx, dy));
        const normX = -dy / len;
        const normY = dx / len;

        const ctrl1X = Math.round(midX + normX * 14);
        const ctrl1Y = Math.round(midY + normY * 14);
        primary += ` Q ${ctrl1X} ${ctrl1Y} ${p2.x} ${p2.y}`;

        const ctrl2X = Math.round(midX - normX * 36);
        const ctrl2Y = Math.round(midY - normY * 36);
        secondary += ` Q ${ctrl2X} ${ctrl2Y} ${p2.x} ${p2.y}`;

        const ctrl3X = Math.round(midX + normX * 48);
        const ctrl3Y = Math.round(midY + normY * 48);
        scenic += ` Q ${ctrl3X} ${ctrl3Y} ${p2.x} ${p2.y}`;

        // Add midpoint toll plaza node along primary curve
        tolls.push({
          name: `${p1.name}–${p2.name} Toll Plaza`,
          lat: Number(((p1.lat + p2.lat) / 2).toFixed(4)),
          lng: Number(((p1.lng + p2.lng) / 2).toFixed(4)),
          x: Math.round(0.25 * p1.x + 0.5 * ctrl1X + 0.25 * p2.x),
          y: Math.round(0.25 * p1.y + 0.5 * ctrl1Y + 0.25 * p2.y),
          type: 'toll',
          kmFromStart: Math.round((p1.kmFromStart + p2.kmFromStart) / 2),
          highway: p1.highway
        });
      }

      this.primarySvgPath = primary;
      this.secondarySvgPath = secondary;
      this.scenicSvgPath = scenic;
      this.tollNodes = tolls;
      this.selectedMapNode = this.mapNodes[0];
    }
  }

  calculateRoute(isManualRefresh: boolean = false): void {
    if (!this.origin.trim() || !this.destination.trim()) return;

    if (isManualRefresh) {
      this.isRefreshingTraffic = true;
    } else {
      this.isCalculating = true;
      this.hasCalculated = false;
    }
    this.routeNotFound = false;
    this.isSaved = false;

    const validWaypoints = this.waypoints.filter(w => w.name.trim()).map(w => w.name.trim());
    const stops = [this.origin.trim(), ...validWaypoints, this.destination.trim()];

    const segmentDistances: number[] = [];
    let totalKm = 0;

    for (let i = 0; i < stops.length - 1; i++) {
      const d = this.getDistance(stops[i], stops[i + 1]);
      segmentDistances.push(d);
      totalKm += d;
    }

    this.buildInteractiveMapGeometry(stops, segmentDistances);

    // Sync with backend route calculation endpoint while providing fast responsive UI
    this.http.post<any>(`${API_BASE_URL}saved-routes/calculate`, {
      origin: this.origin.trim(),
      destination: this.destination.trim(),
      waypoints: validWaypoints
    }).subscribe({
      next: (res) => {
        this.finalizeRouteCalculation(totalKm, stops, isManualRefresh, res?.refreshedAt);
      },
      error: () => {
        this.finalizeRouteCalculation(totalKm, stops, isManualRefresh);
      }
    });
  }

  private finalizeRouteCalculation(totalKm: number, stops: string[], isManualRefresh: boolean, serverTimestamp?: string): void {
    this.isCalculating = false;
    this.isRefreshingTraffic = false;

    this.totalDistanceKm = totalKm;
    const waypointStr = stops.slice(1, -1).join(' → ');
    const templateKey = totalKm <= 500 ? 'expressway' : 'highway';
    const templates = ROUTE_ALTERNATIVES[templateKey];

    const trafficStatuses = ['Smooth Express Flow', 'Normal Flow', 'Clear Highway Corridor'];

    this.alternatives = templates.map((t, i) => {
      const distWithBuffer = totalKm * (i === 0 ? 1 : i === 1 ? 1.12 : 1.25);
      const hrs = Number((distWithBuffer / t.speedKmh).toFixed(1));
      const tolls = Math.max(1, Math.round((distWithBuffer / 100) * t.tollMultiplier * 3));
      const dynamicTraffic = (isManualRefresh && i === 0)
        ? trafficStatuses[Math.floor(Date.now() / 1000) % trafficStatuses.length]
        : t.trafficStatus;

      return {
        id: `alt-${i + 1}`,
        name: t.name,
        via: waypointStr ? `Via ${waypointStr} (${t.via.split('Via ')[1] || ''})` : t.via,
        distanceKm: Math.round(distWithBuffer),
        durationHours: hrs,
        tollCount: tolls,
        roadType: t.roadType,
        trafficStatus: dynamicTraffic,
        trafficColor: t.trafficColor,
        recommended: t.recommended,
      };
    });

    if (!this.alternatives.some(a => a.id === this.selectedAlternativeId)) {
      this.selectedAlternativeId = 'alt-1';
    }
    const active = this.alternatives.find(a => a.id === this.selectedAlternativeId) || this.alternatives[0];
    this.totalDistanceKm = active.distanceKm;
    this.totalDurationHours = active.durationHours;
    this.totalTolls = active.tollCount;
    this.hasCalculated = true;
    this.lastRefreshedAt = serverTimestamp || new Date().toISOString();

    if (isManualRefresh) {
      this.trafficRefreshBanner = `Estimated Haversine & highway corridor model recalculated (${this.origin} → ${this.destination})`;
      setTimeout(() => { this.trafficRefreshBanner = ''; }, 3500);
    }

    this.leafletAvailable = typeof window !== 'undefined' && !!(window as any).L;
    if (this.leafletAvailable) {
      setTimeout(() => {
        this.renderLeafletMap();
        this.fetchOsrmRoadGeometry();
      }, 60);
    }
  }

  refreshRouteAndTraffic(): void {
    this.calculateRoute(true);
  }

  setMapStyle(style: 'standard' | 'terrain' | 'satellite'): void {
    this.mapStyle = style;
    if (this.leafletAvailable && this.leafletMap) {
      this.updateLeafletTileLayer();
    }
  }

  selectAlternative(altId: string): void {
    this.selectedAlternativeId = altId;
    const alt = this.alternatives.find(a => a.id === altId);
    if (alt) {
      this.totalDistanceKm = alt.distanceKm;
      this.totalDurationHours = alt.durationHours;
      this.totalTolls = alt.tollCount;
    }
    if (this.leafletAvailable && this.leafletMap) {
      this.drawLeafletRoutesAndMarkers(false);
    }
  }

  selectMapNode(node: RouteMapNode): void {
    this.selectedMapNode = node;
    if (this.leafletAvailable && this.leafletMap && node) {
      this.leafletMap.panTo([node.lat, node.lng], { animate: true });
    }
  }

  zoomMap(delta: number): void {
    this.mapZoom = Math.min(1.6, Math.max(0.8, Number((this.mapZoom + delta).toFixed(2))));
    if (this.leafletAvailable && this.leafletMap) {
      if (delta > 0) {
        this.leafletMap.zoomIn();
      } else {
        this.leafletMap.zoomOut();
      }
    }
  }

  resetMapView(): void {
    this.mapZoom = 1;
    this.selectedMapNode = this.mapNodes[0] || null;
    if (this.leafletAvailable && this.leafletMap && this.mapNodes.length >= 2) {
      const L = (window as any).L;
      const bounds = L.latLngBounds(this.mapNodes.map(n => [n.lat, n.lng]));
      this.leafletMap.fitBounds(bounds, { padding: [45, 45] });
    }
  }

  /**
   * Initializes or updates the real interactive Leaflet map inside #tedbus-leaflet-map
   */
  private renderLeafletMap(): void {
    const L = (window as any).L;
    if (!L) return;

    const container = document.getElementById('tedbus-leaflet-map');
    if (!container) return;

    // Recreate map instance if container was destroyed & recreated by *ngIf="isCalculating"
    if (this.leafletMap && this.leafletMap.getContainer() !== container) {
      try {
        this.leafletMap.remove();
      } catch (_) {}
      this.leafletMap = null;
      this.leafletTileLayer = null;
      this.leafletRouteGroup = null;
    }

    if (!this.leafletMap) {
      const centerLat = this.mapNodes[0]?.lat || 28.6139;
      const centerLng = this.mapNodes[0]?.lng || 77.2090;
      this.leafletMap = L.map(container, {
        center: [centerLat, centerLng],
        zoom: 6,
        zoomControl: false,
        attributionControl: true
      });
      this.leafletRouteGroup = L.layerGroup().addTo(this.leafletMap);
      this.updateLeafletTileLayer();
    }

    this.leafletMap.invalidateSize();
    this.osrmAlternativesCoords = [];
    this.drawLeafletRoutesAndMarkers(true);
  }

  private updateLeafletTileLayer(): void {
    const L = (window as any).L;
    if (!L || !this.leafletMap) return;

    if (this.leafletTileLayer) {
      this.leafletMap.removeLayer(this.leafletTileLayer);
    }

    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    let attribution = '&copy; OpenStreetMap contributors';

    if (this.mapStyle === 'terrain') {
      tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap &amp; OpenTopoMap';
    } else if (this.mapStyle === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = 'Tiles &copy; Esri';
    }

    this.leafletTileLayer = L.tileLayer(tileUrl, {
      maxZoom: 18,
      attribution
    }).addTo(this.leafletMap);
  }

  /**
   * Builds curved geographical coordinates between stops as fallback before/without OSRM
   */
  private buildCurvedLatLngs(offsetFactor: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i < this.mapNodes.length - 1; i++) {
      const p1 = this.mapNodes[i];
      const p2 = this.mapNodes[i + 1];
      const dLat = p2.lat - p1.lat;
      const dLng = p2.lng - p1.lng;
      const steps = 16;
      for (let s = 0; s <= steps; s++) {
        if (i > 0 && s === 0) continue;
        const t = s / steps;
        const bulge = Math.sin(Math.PI * t) * offsetFactor;
        const lat = p1.lat + dLat * t - dLng * bulge;
        const lng = p1.lng + dLng * t + dLat * bulge;
        pts.push([Number(lat.toFixed(5)), Number(lng.toFixed(5))]);
      }
    }
    return pts;
  }

  /**
   * Queries public OSRM road routing service to snap primary & alternate corridors to actual Indian highways
   */
  private fetchOsrmRoadGeometry(): void {
    if (this.mapNodes.length < 2) return;
    const coordStr = this.mapNodes.map(n => `${n.lng},${n.lat}`).join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&alternatives=true`;

    fetch(osrmUrl)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data.routes) && data.routes.length > 0) {
          this.osrmAlternativesCoords = data.routes.map((rt: any) =>
            (rt.geometry?.coordinates || []).map((c: [number, number]) => [c[1], c[0]] as [number, number])
          );
          // Place toll plazas accurately along the primary highway geometry
          const primaryCoords = this.osrmAlternativesCoords[0];
          if (primaryCoords && primaryCoords.length > 4) {
            this.tollNodes = this.tollNodes.map((t, idx) => {
              const ratio = (idx + 1) / (this.tollNodes.length + 1);
              const pickIdx = Math.min(primaryCoords.length - 1, Math.floor(primaryCoords.length * ratio));
              return {
                ...t,
                lat: Number(primaryCoords[pickIdx][0].toFixed(4)),
                lng: Number(primaryCoords[pickIdx][1].toFixed(4))
              };
            });
          }
          this.ngZone.run(() => {
            this.drawLeafletRoutesAndMarkers(false);
          });
        }
      })
      .catch(() => {
        // Silently retain smooth curved geographical highway corridors when offline
      });
  }

  private drawLeafletRoutesAndMarkers(fitBounds: boolean): void {
    const L = (window as any).L;
    if (!L || !this.leafletMap || !this.leafletRouteGroup) return;

    this.leafletRouteGroup.clearLayers();

    const primaryLatLngs = this.osrmAlternativesCoords[0]?.length
      ? this.osrmAlternativesCoords[0]
      : this.buildCurvedLatLngs(0.04);

    const secondaryLatLngs = this.osrmAlternativesCoords[1]?.length
      ? this.osrmAlternativesCoords[1]
      : this.buildCurvedLatLngs(-0.12);

    const scenicLatLngs = this.osrmAlternativesCoords[2]?.length
      ? this.osrmAlternativesCoords[2]
      : this.buildCurvedLatLngs(0.18);

    // Alternative 3 (Scenic / Bypass)
    if (this.alternatives.length >= 3 && scenicLatLngs.length >= 2) {
      const isSel3 = this.selectedAlternativeId === 'alt-3';
      const poly3 = L.polyline(scenicLatLngs, {
        color: isSel3 ? '#dc2626' : '#64748b',
        weight: isSel3 ? 6 : 3.5,
        opacity: isSel3 ? 0.95 : 0.65,
        dashArray: '6, 8'
      }).addTo(this.leafletRouteGroup);
      poly3.on('click', () => this.ngZone.run(() => this.selectAlternative('alt-3')));
    }

    // Alternative 2 (State Highway)
    if (this.alternatives.length >= 2 && secondaryLatLngs.length >= 2) {
      const isSel2 = this.selectedAlternativeId === 'alt-2';
      const poly2 = L.polyline(secondaryLatLngs, {
        color: isSel2 ? '#f59e0b' : '#475569',
        weight: isSel2 ? 6 : 4,
        opacity: isSel2 ? 0.95 : 0.7,
        dashArray: isSel2 ? undefined : '10, 6'
      }).addTo(this.leafletRouteGroup);
      poly2.on('click', () => this.ngZone.run(() => this.selectAlternative('alt-2')));
    }

    // Alternative 1 (Primary Expressway)
    if (primaryLatLngs.length >= 2) {
      const isSel1 = this.selectedAlternativeId === 'alt-1';
      // Outer casing for primary route
      L.polyline(primaryLatLngs, {
        color: '#ffffff',
        weight: isSel1 ? 9 : 6,
        opacity: 0.85
      }).addTo(this.leafletRouteGroup);

      const poly1 = L.polyline(primaryLatLngs, {
        color: isSel1 ? '#16a34a' : '#334155',
        weight: isSel1 ? 6 : 4,
        opacity: 0.95
      }).addTo(this.leafletRouteGroup);
      poly1.on('click', () => this.ngZone.run(() => this.selectAlternative('alt-1')));
    }

    // Draw Toll Plaza Markers
    this.tollNodes.forEach((toll) => {
      const tollIcon = L.divIcon({
        className: 'tedbus-map-pin',
        html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
          <div style="background:#1d4ed8;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.28);margin-bottom:2px;border:1px solid #fff;">
            Toll (${toll.kmFromStart} km)
          </div>
          <div style="width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid #ffffff;box-shadow:0 2px 5px rgba(0,0,0,0.35);"></div>
        </div>`,
        iconSize: [0, 0]
      });

      const marker = L.marker([toll.lat, toll.lng], { icon: tollIcon }).addTo(this.leafletRouteGroup);
      marker.bindPopup(`<strong>${toll.name}</strong><br/><span style="color:#64748b">${toll.highway} • ${toll.kmFromStart} km from start</span>`);
      marker.on('click', () => this.ngZone.run(() => this.selectMapNode(toll)));
    });

    // Draw Origin, Waypoints & Destination Markers
    this.mapNodes.forEach((node) => {
      const bgColor = node.type === 'origin' ? '#16a34a' : node.type === 'destination' ? '#dc2626' : '#f59e0b';
      const pinSize = node.type === 'waypoint' ? 16 : 20;

      const nodeIcon = L.divIcon({
        className: 'tedbus-map-pin',
        html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
          <div style="width:${pinSize}px;height:${pinSize}px;border-radius:50%;background:${bgColor};border:3px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.4);"></div>
          <div style="margin-top:3px;background:rgba(255,255,255,0.96);color:#0f172a;font-size:11px;font-weight:800;padding:2px 8px;border-radius:6px;border:1px solid #cbd5e1;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.18);">
            ${node.name}
          </div>
        </div>`,
        iconSize: [0, 0]
      });

      const marker = L.marker([node.lat, node.lng], { icon: nodeIcon, zIndexOffset: 200 }).addTo(this.leafletRouteGroup);
      marker.bindPopup(`<strong>${node.name}</strong> (${node.type.toUpperCase()})<br/><span style="color:#64748b">${node.highway} • ${node.kmFromStart} km from start</span>`);
      marker.on('click', () => this.ngZone.run(() => this.selectMapNode(node)));
    });

    if (fitBounds && this.mapNodes.length >= 2) {
      const bounds = L.latLngBounds(this.mapNodes.map(n => [n.lat, n.lng]));
      this.leafletMap.fitBounds(bounds, { padding: [45, 45] });
    }
  }

  getGoogleMapsDirectionsUrl(): string {
    const orig = encodeURIComponent(this.origin.trim() + ', India');
    const dest = encodeURIComponent(this.destination.trim() + ', India');
    const wps = this.waypoints
      .filter(w => w.name.trim())
      .map(w => encodeURIComponent(w.name.trim() + ', India'))
      .join('|');
    const wpParam = wps ? `&waypoints=${wps}` : '';
    return `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}${wpParam}&travelmode=driving`;
  }

  bookBusesForRoute(): void {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    this.router.navigate(['/select-bus'], {
      queryParams: {
        departure: this.origin.trim(),
        arrival: this.destination.trim(),
        date: dateStr,
      }
    });
  }

  loadSavedRoutes(): void {
    const local = localStorage.getItem('tedbus_saved_routes');
    if (local) {
      try {
        this.savedRoutes = JSON.parse(local);
      } catch (_) { this.savedRoutes = []; }
    }

    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const customerId = user._id || '';
    if (customerId) {
      this.http.get<SavedRouteItem[]>(`${API_BASE_URL}saved-routes?customerId=${customerId}`).subscribe({
        next: (data) => { this.savedRoutes = data || []; },
        error: () => {}
      });
    }
  }

  saveCurrentRoute(): void {
    if (!this.origin || !this.destination || !this.hasCalculated) return;

    const routeName = `${this.origin} → ${this.destination}` +
      (this.waypoints.filter(w => w.name.trim()).length ? ` (${this.waypoints.filter(w => w.name.trim()).length} stops)` : '');

    const selected = this.alternatives.find(a => a.id === this.selectedAlternativeId) || this.alternatives[0];
    const origCoords = this.resolveCoords(this.origin);
    const destCoords = this.resolveCoords(this.destination);

    const payload: SavedRouteItem = {
      routeName,
      origin: { name: this.origin, lat: origCoords.lat, lng: origCoords.lng },
      destination: { name: this.destination, lat: destCoords.lat, lng: destCoords.lng },
      waypoints: this.waypoints.filter(w => w.name.trim()).map(w => {
        const wc = this.resolveCoords(w.name.trim());
        return { name: w.name.trim(), lat: wc.lat, lng: wc.lng };
      }),
      totalDistanceKm: selected ? selected.distanceKm : this.totalDistanceKm,
      estimatedDurationMin: selected ? Math.round(selected.durationHours * 60) : 300,
      createdAt: new Date().toISOString(),
    };

    const alreadyExists = this.savedRoutes.some(r => r.routeName === routeName);
    if (alreadyExists) {
      this.saveFeedback = 'Already saved!';
      this.isSaved = true;
      setTimeout(() => this.saveFeedback = '', 2500);
      return;
    }

    this.isSaving = true;
    this.savedRoutes.unshift(payload);
    localStorage.setItem('tedbus_saved_routes', JSON.stringify(this.savedRoutes));

    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    if (user._id) {
      this.http.post<SavedRouteItem>(`${API_BASE_URL}saved-routes`, { ...payload, customerId: user._id }).subscribe({
        next: (saved) => {
          this.savedRoutes[0] = saved;
          localStorage.setItem('tedbus_saved_routes', JSON.stringify(this.savedRoutes));
        },
        error: () => {}
      });
    }

    this.isSaving = false;
    this.isSaved = true;
    this.saveFeedback = 'Saved to Favourites!';
    setTimeout(() => { this.saveFeedback = ''; }, 2500);
  }

  loadSavedRouteIntoPlanner(route: SavedRouteItem): void {
    this.origin = route.origin.name;
    this.destination = route.destination.name;
    this.waypoints = route.waypoints.map(w => ({ name: w.name }));
    this.isSaved = false;
    this.calculateRoute();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  deleteSavedRoute(index: number, route: SavedRouteItem): void {
    this.savedRoutes.splice(index, 1);
    localStorage.setItem('tedbus_saved_routes', JSON.stringify(this.savedRoutes));
    if (route._id) {
      this.http.delete(`${API_BASE_URL}saved-routes/${route._id}`).subscribe();
    }
  }
}
