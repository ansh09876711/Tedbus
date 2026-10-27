import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { API_BASE_URL } from '../../config';
import { TranslationService } from '../../service/translation.service';

interface Waypoint {
  name: string;
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
  origin: { name: string };
  destination: { name: string };
  waypoints: { name: string }[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
  createdAt?: string;
}

// Real Indian inter-city distances in km (approximate straight road distance)
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

// Route alternatives per city type
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
export class RoutePlannerComponent implements OnInit {
  origin: string = 'Delhi';
  destination: string = 'Jaipur';
  waypoints: Waypoint[] = [];

  isCalculating: boolean = false;
  hasCalculated: boolean = false;
  alternatives: RouteAlternative[] = [];
  selectedAlternativeId: string = 'alt-1';
  saveFeedback: string = '';
  isSaved: boolean = false;

  savedRoutes: SavedRouteItem[] = [];
  isSaving: boolean = false;

  originCities: string[] = ['Delhi', 'Mumbai', 'Bangalore', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune', 'Jaipur'];
  destinationCities: string[] = ['Jaipur', 'Agra', 'Goa', 'Mysore', 'Darjeeling', 'Pondicherry', 'Lucknow', 'Chandigarh'];

  totalDistanceKm: number = 0;
  totalDurationHours: number = 0;
  totalTolls: number = 0;
  routeNotFound: boolean = false;

  constructor(
    private http: HttpClient,
    private router: Router,
    public translationService: TranslationService
  ) {}

  ngOnInit(): void {
    this.calculateRoute();
    this.loadSavedRoutes();
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
    if (!fromKey) return 0;
    const toKey = Object.keys(CITY_DISTANCE_MAP[fromKey] || {}).find(k => k.toLowerCase() === to.toLowerCase());
    if (!toKey) return 0;
    return CITY_DISTANCE_MAP[fromKey][toKey] || 0;
  }

  calculateRoute(): void {
    if (!this.origin.trim() || !this.destination.trim()) return;

    this.isCalculating = true;
    this.hasCalculated = false;
    this.routeNotFound = false;
    this.isSaved = false;

    setTimeout(() => {
      this.isCalculating = false;

      // Calculate total distance including waypoints
      const stops = [this.origin, ...this.waypoints.filter(w => w.name.trim()).map(w => w.name.trim()), this.destination];
      let totalKm = 0;
      let segmentFound = true;

      for (let i = 0; i < stops.length - 1; i++) {
        const d = this.getDistance(stops[i], stops[i + 1]);
        if (d === 0) {
          // Try reverse
          const dr = this.getDistance(stops[i + 1], stops[i]);
          if (dr === 0) { segmentFound = false; break; }
          totalKm += dr;
        } else {
          totalKm += d;
        }
      }

      if (!segmentFound || totalKm === 0) {
        // Fallback: estimate based on generic ~800km
        totalKm = 600;
      }

      this.totalDistanceKm = totalKm;
      const waypointStr = stops.slice(1, -1).join(' → ');

      // Choose template based on distance
      const templateKey = totalKm <= 500 ? 'expressway' : 'highway';
      const templates = ROUTE_ALTERNATIVES[templateKey];

      this.alternatives = templates.map((t, i) => {
        const distWithBuffer = totalKm * (i === 0 ? 1 : i === 1 ? 1.12 : 1.25);
        const hrs = Number((distWithBuffer / t.speedKmh).toFixed(1));
        const tolls = Math.max(1, Math.round((distWithBuffer / 100) * t.tollMultiplier * 3));
        return {
          id: `alt-${i + 1}`,
          name: t.name,
          via: waypointStr ? `Via ${waypointStr} (${t.via.split('Via ')[1] || ''})` : t.via,
          distanceKm: Math.round(distWithBuffer),
          durationHours: hrs,
          tollCount: tolls,
          roadType: t.roadType,
          trafficStatus: t.trafficStatus,
          trafficColor: t.trafficColor,
          recommended: t.recommended,
        };
      });

      this.selectedAlternativeId = 'alt-1';
      const best = this.alternatives[0];
      this.totalDistanceKm = best.distanceKm;
      this.totalDurationHours = best.durationHours;
      this.totalTolls = best.tollCount;
      this.hasCalculated = true;
    }, 600);
  }

  selectAlternative(altId: string): void {
    this.selectedAlternativeId = altId;
    const alt = this.alternatives.find(a => a.id === altId);
    if (alt) {
      this.totalDistanceKm = alt.distanceKm;
      this.totalDurationHours = alt.durationHours;
      this.totalTolls = alt.tollCount;
    }
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
    // Load from localStorage first for immediate UX
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

    const payload: SavedRouteItem = {
      routeName,
      origin: { name: this.origin },
      destination: { name: this.destination },
      waypoints: this.waypoints.filter(w => w.name.trim()).map(w => ({ name: w.name.trim() })),
      totalDistanceKm: selected ? selected.distanceKm : this.totalDistanceKm,
      estimatedDurationMin: selected ? Math.round(selected.durationHours * 60) : 300,
      createdAt: new Date().toISOString(),
    };

    // Check if already saved
    const alreadyExists = this.savedRoutes.some(r => r.routeName === routeName);
    if (alreadyExists) {
      this.saveFeedback = 'Already saved!';
      this.isSaved = true;
      setTimeout(() => this.saveFeedback = '', 2500);
      return;
    }

    this.isSaving = true;
    this.savedRoutes.unshift(payload);
    // Persist to localStorage
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
