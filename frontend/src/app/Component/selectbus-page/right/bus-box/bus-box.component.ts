import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-bus-box',
  templateUrl: './bus-box.component.html',
  styleUrl: './bus-box.component.css'
})
export class BusBoxComponent implements OnInit, OnChanges {
  @Input() rating: number[] = [];
  @Input() operatorname: string = '';
  @Input() bustype: string = '';
  @Input() departuretime: string = '';
  @Input() reschedulable: number = 0;
  @Input() livetracking: number = 0;
  @Input() filledseats: any[] = [];
  @Input() routedetails: any;
  @Input() busid: string | undefined = '';

  avgrating: number = 4.3;
  totalreview: number = 45;
  seatprivce: number = 450;
  get seatprice(): number { return this.seatprivce; }
  bustypename: string = '';
  busdeparturetime: number = 6;
  busarrivaltime: number = 14;

  constructor() {}

  ngOnInit(): void {
    this.calculateDetails();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.calculateDetails();
  }

  calculateDetails(): void {
    if (this.rating && this.rating.length) {
      let sum = 0;
      this.rating.forEach((item) => {
        sum += item;
      });
      this.avgrating = +(sum / this.rating.length);
      this.totalreview = this.rating.length;
    } else {
      this.avgrating = 4.3;
      this.totalreview = 0;
    }

    const duration = this.routedetails && this.routedetails.duration ? Number(this.routedetails.duration) : 6;
    const typeLower = (this.bustype || '').toLowerCase();

    if (typeLower.includes('standard')) {
      this.seatprivce = Math.max(250, Math.floor(50 * Math.floor(duration) / 2));
      this.bustypename = 'Standard Seater';
    } else if (typeLower.includes('sleeper')) {
      this.seatprivce = Math.max(450, Math.floor(100 * Math.floor(duration) / 2));
      this.bustypename = 'Volvo Multi-Axle Sleeper';
    } else if (typeLower.includes('a/c') || typeLower.includes('seater')) {
      this.seatprivce = Math.max(350, Math.floor(85 * Math.floor(duration) / 2));
      this.bustypename = 'A/C Seater';
    } else {
      this.seatprivce = Math.max(200, Math.floor(45 * Math.floor(duration) / 2));
      this.bustypename = 'Non A/C Seater';
    }

    const numericvalue = parseInt(this.departuretime, 10) || 8;
    this.busdeparturetime = numericvalue;
    this.busarrivaltime = (numericvalue + duration) % 24;
  }
}
