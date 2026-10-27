import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { FilterService, FilterState } from '../../../../service/filter.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-sorting-bar',
  templateUrl: './sorting-bar.component.html',
  styleUrl: './sorting-bar.component.css'
})
export class SortingBarComponent implements OnInit, OnDestroy {
  @Input() totalCount: number = 0;
  @Input() matchedCount: number = 0;

  filterState: FilterState = this.filterService.currentState;
  activeFilterCount: number = 0;
  private subs = new Subscription();

  constructor(public filterService: FilterService) {}

  ngOnInit(): void {
    this.subs.add(
      this.filterService.filterState$.subscribe(state => {
        this.filterState = state;
        this.activeFilterCount = this.filterService.getActiveFilterCount();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onSortChange(event: any): void {
    this.filterService.setSortBy(event.target.value);
  }

  sortByColumn(type: 'departure' | 'fare' | 'rating'): void {
    if (type === 'departure') {
      const next = this.filterState.sortBy === 'dep_early' ? 'dep_late' : 'dep_early';
      this.filterService.setSortBy(next);
    } else if (type === 'fare') {
      const next = this.filterState.sortBy === 'price_low' ? 'price_high' : 'price_low';
      this.filterService.setSortBy(next);
    } else if (type === 'rating') {
      this.filterService.setSortBy('rating_high');
    }
  }

  removePriceFilter(): void {
    this.filterService.setPriceRange('all');
  }

  removeBoardingFilter(): void {
    this.filterService.setBoardingPoint('');
  }

  removeDroppingFilter(): void {
    this.filterService.setDroppingPoint('');
  }

  removeOperatorFilter(): void {
    this.filterService.setOperator('');
  }

  removeBusType(type: 'seater' | 'sleeper' | 'ac' | 'nonac'): void {
    this.filterService.updateBusType(type, false);
  }

  removeDepartureTime(time: 'before6am' | 'sixTo12' | 'twelveTo6' | 'after6pm'): void {
    this.filterService.updateDepartureTime(time, false);
  }

  removeArrivalTime(time: 'before6am' | 'sixTo12' | 'twelveTo6' | 'after6pm'): void {
    this.filterService.updateArrivalTime(time, false);
  }

  removeAmenity(amenity: 'wifi' | 'waterBottle' | 'blankets' | 'chargingPoint' | 'movie'): void {
    this.filterService.updateAmenity(amenity, false);
  }

  removeLiveTracking(): void {
    this.filterService.updateFilter({ liveTracking: false });
  }

  removeReschedulable(): void {
    this.filterService.updateFilter({ reschedulable: false });
  }

  clearAll(): void {
    this.filterService.resetFilters();
  }
}
