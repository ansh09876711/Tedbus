import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-small-seats',
  templateUrl: './small-seats.component.html',
  styleUrl: './small-seats.component.css'
})
export class SmallSeatsComponent implements OnInit {
  @Input() seatno: number = 0;
  @Input() alreadybookedseats: number[] = [];
  @Input() selectedseats: number[] = [];
  @Output() seatselected = new EventEmitter<number>();

  isBooked: boolean = false;
  isSelected: boolean = false;

  ngOnInit(): void {
    if (this.alreadybookedseats && this.alreadybookedseats.includes(this.seatno)) {
      this.isBooked = true;
    }
  }

  handleclick(): void {
    if (this.isBooked) {
      return;
    }
    this.seatselected.emit(this.seatno);
  }

  checkSelected(): boolean {
    return this.selectedseats && this.selectedseats.includes(this.seatno);
  }
}
