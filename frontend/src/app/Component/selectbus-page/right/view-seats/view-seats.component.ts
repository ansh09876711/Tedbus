import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-view-seats',
  templateUrl: './view-seats.component.html',
  styleUrl: './view-seats.component.css'
})
export class ViewSeatsComponent implements OnChanges {
  @Input() filledseats: any[] = [];
  @Input() seatprice: number = 0;
  @Input() routedetails: any;
  @Input() busid: string | undefined = '';
  @Input() busarrivaltime: number = 0;
  @Input() busdeparturetime: number = 0;
  @Input() operatorname: string = '';

  selectedseats: number[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filledseats'] && Array.isArray(this.filledseats)) {
      const bookedSet = new Set(this.filledseats.map(s => Number(s)));
      this.selectedseats = this.selectedseats.filter(s => !bookedSet.has(Number(s)));
    }
  }

  generatearray(len: number): number[] {
    const arr: number[] = [];
    for (let i = 1; i <= len; i++) {
      arr.push(i);
    }
    return arr;
  }

  handleselectedseats(seatno: number): void {
    const index = this.selectedseats.indexOf(seatno);
    if (index > -1) {
      this.selectedseats.splice(index, 1);
    } else {
      this.selectedseats.push(seatno);
    }
  }

  getTotalPrice(): number {
    return this.selectedseats.length * this.seatprice;
  }
}
