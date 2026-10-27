import { Component, OnInit, OnDestroy } from '@angular/core';
import { FilterService, FilterState } from '../../../service/filter.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-left',
  templateUrl: './left.component.html',
  styleUrl: './left.component.css'
})
export class LeftComponent implements OnInit, OnDestroy {
  filterState: FilterState = this.filterService.currentState;
  activeFilterCount: number = 0;

  boardingPoints: string[] = [];
  droppingPoints: string[] = [];
  operators: string[] = [];

  // Dropdown accordions state (expanded / collapsed)
  openSections: { [key: string]: boolean } = {
    price: true,
    busType: true,
    departureTime: true,
    arrivalTime: false,
    boarding: true,
    dropping: true,
    operators: true,
    features: true,
    amenities: false
  };

  amenityIcons: { [key: string]: string } = {
    wifi: 'wifi',
    waterBottle: 'local_drink',
    blankets: 'hotel',
    chargingPoint: 'battery_charging_full',
    movie: 'movie'
  };

  private subs = new Subscription();

  constructor(public filterService: FilterService) {}

  ngOnInit(): void {
    this.subs.add(
      this.filterService.filterState$.subscribe(state => {
        this.filterState = state;
        this.activeFilterCount = this.filterService.getActiveFilterCount();
      })
    );

    this.subs.add(
      this.filterService.boardingPoints$.subscribe(points => {
        this.boardingPoints = points;
      })
    );

    this.subs.add(
      this.filterService.droppingPoints$.subscribe(points => {
        this.droppingPoints = points;
      })
    );

    this.subs.add(
      this.filterService.operators$.subscribe(ops => {
        this.operators = ops;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  toggleSection(section: string): void {
    this.openSections[section] = !this.openSections[section];
  }

  onPriceChange(event: any): void {
    this.filterService.setPriceRange(event.target.value);
  }

  onBoardingChange(event: any): void {
    this.filterService.setBoardingPoint(event.target.value);
  }

  onDroppingChange(event: any): void {
    this.filterService.setDroppingPoint(event.target.value);
  }

  onOperatorChange(event: any): void {
    this.filterService.setOperator(event.target.value);
  }

  toggleBusType(type: 'seater' | 'sleeper' | 'ac' | 'nonac'): void {
    this.filterService.updateBusType(type, !this.filterState.busType[type]);
  }

  toggleDepartureTime(time: 'before6am' | 'sixTo12' | 'twelveTo6' | 'after6pm'): void {
    this.filterService.updateDepartureTime(time, !this.filterState.departureTime[time]);
  }

  toggleArrivalTime(time: 'before6am' | 'sixTo12' | 'twelveTo6' | 'after6pm'): void {
    this.filterService.updateArrivalTime(time, !this.filterState.arrivalTime[time]);
  }

  toggleAmenity(amenity: 'wifi' | 'waterBottle' | 'blankets' | 'chargingPoint' | 'movie'): void {
    this.filterService.updateAmenity(amenity, !this.filterState.amenities[amenity]);
  }

  toggleLiveTracking(): void {
    this.filterService.toggleLiveTracking();
  }

  toggleReschedulable(): void {
    this.filterService.toggleReschedulable();
  }

  resetAll(): void {
    this.filterService.resetFilters();
  }
}
