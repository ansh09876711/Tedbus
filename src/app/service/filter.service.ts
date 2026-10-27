import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface FilterState {
  busType: {
    seater: boolean;
    sleeper: boolean;
    ac: boolean;
    nonac: boolean;
  };
  departureTime: {
    before6am: boolean;
    sixTo12: boolean;
    twelveTo6: boolean;
    after6pm: boolean;
  };
  arrivalTime: {
    before6am: boolean;
    sixTo12: boolean;
    twelveTo6: boolean;
    after6pm: boolean;
  };
  liveTracking: boolean;
  reschedulable: boolean;
  amenities: {
    wifi: boolean;
    waterBottle: boolean;
    blankets: boolean;
    chargingPoint: boolean;
    movie: boolean;
  };
  selectedBoarding: string;
  selectedDropping: string;
  selectedOperator: string;
  priceRange: string;
  sortBy: string;
}

export const initialFilterState: FilterState = {
  busType: {
    seater: false,
    sleeper: false,
    ac: false,
    nonac: false
  },
  departureTime: {
    before6am: false,
    sixTo12: false,
    twelveTo6: false,
    after6pm: false
  },
  arrivalTime: {
    before6am: false,
    sixTo12: false,
    twelveTo6: false,
    after6pm: false
  },
  liveTracking: false,
  reschedulable: false,
  amenities: {
    wifi: false,
    waterBottle: false,
    blankets: false,
    chargingPoint: false,
    movie: false
  },
  selectedBoarding: '',
  selectedDropping: '',
  selectedOperator: '',
  priceRange: 'all',
  sortBy: 'recommended'
};

@Injectable({
  providedIn: 'root'
})
export class FilterService {
  private filterSubject = new BehaviorSubject<FilterState>(this.cloneInitialState());
  filterState$: Observable<FilterState> = this.filterSubject.asObservable();

  private boardingPointsSubject = new BehaviorSubject<string[]>([]);
  boardingPoints$: Observable<string[]> = this.boardingPointsSubject.asObservable();

  private droppingPointsSubject = new BehaviorSubject<string[]>([]);
  droppingPoints$: Observable<string[]> = this.droppingPointsSubject.asObservable();

  private operatorsSubject = new BehaviorSubject<string[]>([]);
  operators$: Observable<string[]> = this.operatorsSubject.asObservable();

  constructor() {}

  private cloneInitialState(): FilterState {
    return JSON.parse(JSON.stringify(initialFilterState));
  }

  get currentState(): FilterState {
    return this.filterSubject.value;
  }

  updateFilter(partial: Partial<FilterState>): void {
    this.filterSubject.next({
      ...this.currentState,
      ...partial
    });
  }

  updateBusType(type: keyof FilterState['busType'], value: boolean): void {
    const busType = { ...this.currentState.busType, [type]: value };
    this.updateFilter({ busType });
  }

  updateDepartureTime(time: keyof FilterState['departureTime'], value: boolean): void {
    const departureTime = { ...this.currentState.departureTime, [time]: value };
    this.updateFilter({ departureTime });
  }

  updateArrivalTime(time: keyof FilterState['arrivalTime'], value: boolean): void {
    const arrivalTime = { ...this.currentState.arrivalTime, [time]: value };
    this.updateFilter({ arrivalTime });
  }

  updateAmenity(amenity: keyof FilterState['amenities'], value: boolean): void {
    const amenities = { ...this.currentState.amenities, [amenity]: value };
    this.updateFilter({ amenities });
  }

  toggleLiveTracking(): void {
    this.updateFilter({ liveTracking: !this.currentState.liveTracking });
  }

  toggleReschedulable(): void {
    this.updateFilter({ reschedulable: !this.currentState.reschedulable });
  }

  setBoardingPoint(point: string): void {
    this.updateFilter({ selectedBoarding: point });
  }

  setDroppingPoint(point: string): void {
    this.updateFilter({ selectedDropping: point });
  }

  setOperator(operator: string): void {
    this.updateFilter({ selectedOperator: operator });
  }

  setPriceRange(range: string): void {
    this.updateFilter({ priceRange: range });
  }

  setSortBy(sort: string): void {
    this.updateFilter({ sortBy: sort });
  }

  resetFilters(): void {
    this.filterSubject.next(this.cloneInitialState());
  }

  setRouteAndBusMetadata(boardings: string[], droppings: string[], operators: string[]): void {
    this.boardingPointsSubject.next(boardings || []);
    this.droppingPointsSubject.next(droppings || []);
    this.operatorsSubject.next(operators || []);
  }

  getActiveFilterCount(): number {
    let count = 0;
    const state = this.currentState;

    if (state.liveTracking) count++;
    if (state.reschedulable) count++;
    if (state.selectedBoarding) count++;
    if (state.selectedDropping) count++;
    if (state.selectedOperator) count++;
    if (state.priceRange && state.priceRange !== 'all') count++;

    Object.values(state.busType).forEach(v => { if (v) count++; });
    Object.values(state.departureTime).forEach(v => { if (v) count++; });
    Object.values(state.arrivalTime).forEach(v => { if (v) count++; });
    Object.values(state.amenities).forEach(v => { if (v) count++; });

    return count;
  }
}
