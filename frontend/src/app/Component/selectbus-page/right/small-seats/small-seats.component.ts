import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-small-seats',
  templateUrl: './small-seats.component.html',
  styleUrl: './small-seats.component.css'
})
export class SmallSeatsComponent implements OnInit, OnChanges {
  @Input() seatno: number = 0;
  @Input() alreadybookedseats: number[] = [];
  @Input() selectedseats: number[] = [];
  @Output() seatselected = new EventEmitter<number>();

  isBooked: boolean = false;

  ngOnInit(): void {
    this.updateSeatBookingStatus();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.updateSeatBookingStatus();
  }

  private updateSeatBookingStatus(): void {
    this.isBooked = Boolean(
      Array.isArray(this.alreadybookedseats) &&
      this.alreadybookedseats.some(seat => Number(seat) === Number(this.seatno))
    );
  }

  handleclick(): void {
    this.updateSeatBookingStatus();
    if (this.isBooked) {
      return;
    }
    this.seatselected.emit(this.seatno);
  }

  checkSelected(): boolean {
    if (this.isBooked) {
      return false;
    }
    return Boolean(this.selectedseats && this.selectedseats.includes(this.seatno));
  }
}
