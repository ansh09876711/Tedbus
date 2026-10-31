import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BusService } from '../../../service/bus.service';
import { FilterService, FilterState } from '../../../service/filter.service';
import { Bus } from '../../../model/bus.model';
import { Route } from '../../../model/routes.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-right',
  templateUrl: './right.component.html',
  styleUrl: './right.component.css'
})
export class RightComponent implements OnInit, OnDestroy {
  rawBuses: Bus[] = [];
  matchedbus: Bus[] = [];
  routes: any = null;
  seats: { [key: string]: any } = {};

  departurevar: string = '';
  arrival: string = '';
  date: string = '';
  loading: boolean = false;

  private currentFilterState: FilterState = this.filterService.currentState;
  private subs = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private busservice: BusService,
    public filterService: FilterService
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.route.queryParams.subscribe(params => {
        this.departurevar = params['departure'] || '';
        this.arrival = params['arrival'] || '';
        this.date = params['date'] || '';

        if (this.departurevar && this.arrival) {
          this.fetchBuses();
        }
      })
    );

    this.subs.add(
      this.filterService.filterState$.subscribe(state => {
        this.currentFilterState = state;
        this.applyFiltersAndSorting();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  fetchBuses(): void {
    this.loading = true;
    this.busservice.GETBUSDETAILS(this.departurevar, this.arrival, this.date).subscribe({
      next: (response: any) => {
        this.rawBuses = response?.matchedBuses || [];
        this.routes = response?.route;
        this.seats = response?.busidwithseatobj || {};
        this.loading = false;

        // Populate dropdown filter options
        const boardings = this.routes?.departureLocation?.subLocations || [];
        const droppings = this.routes?.arrivalLocation?.subLocations || [];
        const operators = Array.from(new Set(this.rawBuses.map(b => b.operatorName))).filter(Boolean);

        this.filterService.setRouteAndBusMetadata(boardings, droppings, operators);
        this.applyFiltersAndSorting();
      },
      error: (err) => {
        console.error("Failed to load buses:", err);
        this.loading = false;
        this.rawBuses = [];
        this.matchedbus = [];
      }
    });
  }

  resetAllFilters(): void {
    this.filterService.resetFilters();
  }

  private applyFiltersAndSorting(): void {
    if (!this.rawBuses || !this.rawBuses.length) {
      this.matchedbus = [];
      return;
    }

    const duration = this.routes?.duration ? Number(this.routes.duration) : 6;
    const state = this.currentFilterState;

    let filtered = [...this.rawBuses];

    // 1. Bus Type Filter
    const activeBusTypes = Object.entries(state.busType).filter(([_, active]) => active).map(([type]) => type);
    if (activeBusTypes.length > 0) {
      filtered = filtered.filter(bus => {
        const typeStr = (bus.busType || '').toLowerCase();
        return activeBusTypes.some(type => {
          if (type === 'sleeper') return typeStr.includes('sleeper');
          if (type === 'ac') return typeStr.includes('a/c') || typeStr.includes('ac');
          if (type === 'nonac') return !typeStr.includes('a/c') && !typeStr.includes('ac');
          if (type === 'seater') return typeStr.includes('seater') || typeStr.includes('standard');
          return false;
        });
      });
    }

    // 2. Departure Time Filter
    const activeDepTimes = Object.entries(state.departureTime).filter(([_, active]) => active).map(([k]) => k);
    if (activeDepTimes.length > 0) {
      filtered = filtered.filter(bus => {
        const depHour = parseInt(bus.departureTime, 10) || 8;
        return activeDepTimes.some(slot => {
          if (slot === 'before6am') return depHour < 6;
          if (slot === 'sixTo12') return depHour >= 6 && depHour < 12;
          if (slot === 'twelveTo6') return depHour >= 12 && depHour < 18;
          if (slot === 'after6pm') return depHour >= 18;
          return false;
        });
      });
    }

    // 3. Arrival Time Filter
    const activeArrTimes = Object.entries(state.arrivalTime).filter(([_, active]) => active).map(([k]) => k);
    if (activeArrTimes.length > 0) {
      filtered = filtered.filter(bus => {
        const depHour = parseInt(bus.departureTime, 10) || 8;
        const arrHour = (depHour + duration) % 24;
        return activeArrTimes.some(slot => {
          if (slot === 'before6am') return arrHour < 6;
          if (slot === 'sixTo12') return arrHour >= 6 && arrHour < 12;
          if (slot === 'twelveTo6') return arrHour >= 12 && arrHour < 18;
          if (slot === 'after6pm') return arrHour >= 18;
          return false;
        });
      });
    }

    // 4. Live Tracking Filter
    if (state.liveTracking) {
      filtered = filtered.filter(bus => bus.liveTracking === 1);
    }

    // 5. Reschedulable Filter
    if (state.reschedulable) {
      filtered = filtered.filter(bus => bus.reschedulable === 1);
    }

    // 6. Operator Dropdown Filter
    if (state.selectedOperator) {
      filtered = filtered.filter(bus => bus.operatorName === state.selectedOperator);
    }

    // 7. Price Range Dropdown Filter
    if (state.priceRange && state.priceRange !== 'all') {
      filtered = filtered.filter(bus => {
        const fare = this.calculateBusFare(bus, duration);
        if (state.priceRange === 'under500') return fare <= 500;
        if (state.priceRange === '500to1000') return fare > 500 && fare <= 1000;
        if (state.priceRange === 'above1000') return fare > 1000;
        return true;
      });
    }

    // 8. Boarding Point Filter
    if (state.selectedBoarding) {
      const allBoardings: string[] = this.routes?.departureLocation?.subLocations || [];
      filtered = filtered.filter(bus => {
        const busIdx = this.rawBuses.indexOf(bus);
        const busBoardings = this.getBusBoardingPoints(bus, busIdx, allBoardings);
        return busBoardings.some(bp => bp.toLowerCase() === state.selectedBoarding.toLowerCase());
      });
    }

    // 9. Dropping Point Filter
    if (state.selectedDropping) {
      const allDroppings: string[] = this.routes?.arrivalLocation?.subLocations || [];
      filtered = filtered.filter(bus => {
        const busIdx = this.rawBuses.indexOf(bus);
        const busDroppings = this.getBusDroppingPoints(bus, busIdx, allDroppings);
        return busDroppings.some(dp => dp.toLowerCase() === state.selectedDropping.toLowerCase());
      });
    }

    // 10. Amenities Filter (every checked amenity must be present on the bus)
    const activeAmenities = Object.entries(state.amenities)
      .filter(([_, active]) => active)
      .map(([key]) => key as keyof FilterState['amenities']);
    if (activeAmenities.length > 0) {
      filtered = filtered.filter(bus => {
        const busAmenities = this.getBusAmenities(bus);
        return activeAmenities.every(amenityKey => Boolean(busAmenities[amenityKey]));
      });
    }

    // 11. Sorting
    filtered.sort((a, b) => {
      const fareA = this.calculateBusFare(a, duration);
      const fareB = this.calculateBusFare(b, duration);
      const ratingA = this.calculateAvgRating(a);
      const ratingB = this.calculateAvgRating(b);
      const depA = parseInt(a.departureTime, 10) || 8;
      const depB = parseInt(b.departureTime, 10) || 8;

      switch (state.sortBy) {
        case 'price_low':
          return fareA - fareB;
        case 'price_high':
          return fareB - fareA;
        case 'rating_high':
          return ratingB - ratingA;
        case 'dep_early':
          return depA - depB;
        case 'dep_late':
          return depB - depA;
        default:
          return ratingB - ratingA; // Recommended: highest rating first
      }
    });

    this.matchedbus = filtered;
  }

  private calculateBusFare(bus: Bus, duration: number): number {
    const typeLower = (bus.busType || '').toLowerCase();
    if (typeLower.includes('standard')) {
      return Math.max(250, Math.floor(50 * Math.floor(duration) / 2));
    } else if (typeLower.includes('sleeper')) {
      return Math.max(450, Math.floor(100 * Math.floor(duration) / 2));
    } else if (typeLower.includes('a/c') || typeLower.includes('seater')) {
      return Math.max(350, Math.floor(85 * Math.floor(duration) / 2));
    }
    return Math.max(200, Math.floor(45 * Math.floor(duration) / 2));
  }

  private calculateAvgRating(bus: Bus): number {
    if (bus.rating && bus.rating.length) {
      return bus.rating.reduce((sum, r) => sum + r, 0) / bus.rating.length;
    }
    return 4.2;
  }

  private getBusBoardingPoints(bus: Bus, busIndex: number, routeSubLocations: string[]): string[] {
    if (Array.isArray(bus.boardingPoints) && bus.boardingPoints.length > 0) {
      return bus.boardingPoints;
    }
    if (!routeSubLocations || routeSubLocations.length === 0) {
      return [];
    }
    if (routeSubLocations.length <= 2 || this.rawBuses.length <= 1) {
      return routeSubLocations;
    }
    const safeIdx = Math.max(0, busIndex);
    return routeSubLocations.filter((_, idx) => idx === 0 || (idx + safeIdx) % 2 === 0 || idx === safeIdx % routeSubLocations.length);
  }

  private getBusDroppingPoints(bus: Bus, busIndex: number, routeSubLocations: string[]): string[] {
    if (Array.isArray(bus.droppingPoints) && bus.droppingPoints.length > 0) {
      return bus.droppingPoints;
    }
    if (!routeSubLocations || routeSubLocations.length === 0) {
      return [];
    }
    if (routeSubLocations.length <= 2 || this.rawBuses.length <= 1) {
      return routeSubLocations;
    }
    const safeIdx = Math.max(0, busIndex);
    return routeSubLocations.filter((_, idx) => idx === 0 || (idx + safeIdx) % 2 === 0 || idx === safeIdx % routeSubLocations.length);
  }

  private getBusAmenities(bus: Bus): FilterState['amenities'] {
    if (bus.amenities) {
      return {
        wifi: Boolean(bus.amenities.wifi),
        waterBottle: Boolean(bus.amenities.waterBottle),
        blankets: Boolean(bus.amenities.blankets),
        chargingPoint: Boolean(bus.amenities.chargingPoint),
        movie: Boolean(bus.amenities.movie)
      };
    }
    const typeLower = (bus.busType || '').toLowerCase();
    const isSleeper = typeLower.includes('sleeper');
    const isAc = typeLower.includes('a/c') || typeLower.includes('ac') || isSleeper;
    return {
      wifi: isAc || bus.liveTracking === 1,
      waterBottle: isAc || bus.reschedulable === 1,
      blankets: isSleeper,
      chargingPoint: true,
      movie: isSleeper || (isAc && bus.liveTracking === 1)
    };
  }
}
