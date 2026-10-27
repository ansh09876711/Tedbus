import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from '../../../../service/dataservice.service';

interface Passenger {
  name: string;
  gender: string;
  age: number | null;
  seatNumber: number;
}

@Component({
  selector: 'app-bus-booking-form',
  templateUrl: './bus-booking-form.component.html',
  styleUrl: './bus-booking-form.component.css'
})
export class BusBookingFormComponent implements OnInit {
  @Input() selectedseat: number[] = [];
  @Input() seatprice: number = 0;
  @Input() busid: string | undefined = '';
  @Input() routedetails: any;
  @Input() busarrivaltime: number = 0;
  @Input() busdeparturetime: number = 0;
  @Input() operatorname: string = '';
  @Output() bookingSuccess = new EventEmitter<void>();

  passengers: Passenger[] = [];
  email: string = '';
  phoneNumber: string = '';

  constructor(private router: Router, private dataService: DataService) {}

  ngOnInit(): void {
    this.updatePassengerList();
  }

  ngOnChanges(): void {
    this.updatePassengerList();
  }

  updatePassengerList(): void {
    if (!this.selectedseat) return;
    this.passengers = this.selectedseat.map(seat => {
      const existing = this.passengers.find(p => p.seatNumber === seat);
      return existing || {
        name: '',
        gender: 'Male',
        age: null,
        seatNumber: seat
      };
    });
  }

  getTotalAmount(): number {
    return (this.selectedseat ? this.selectedseat.length : 0) * this.seatprice;
  }

  onSubmit(): void {
    if (!this.email || !this.phoneNumber) {
      alert('Please provide contact email and phone number.');
      return;
    }

    for (let p of this.passengers) {
      if (!p.name || !p.age) {
        alert(`Please complete passenger details for Seat #${p.seatNumber}`);
        return;
      }
    }

    const bookingPayload = {
      busId: this.busid,
      operatorName: this.operatorname,
      route: this.routedetails,
      departureTime: this.busdeparturetime,
      arrivalTime: this.busarrivaltime,
      seats: this.selectedseat,
      seatPrice: this.seatprice,
      totalAmount: this.getTotalAmount(),
      passengers: this.passengers,
      email: this.email,
      phoneNumber: this.phoneNumber,
      date: new Date().toISOString().split('T')[0]
    };

    // Store in data service / localStorage for payment page
    this.dataService.setData(bookingPayload);
    localStorage.setItem('pendingBooking', JSON.stringify(bookingPayload));

    this.bookingSuccess.emit();
    this.router.navigate(['/payment']);
  }
}
