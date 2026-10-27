import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { API_BASE_URL } from '../../../config';

@Component({
  selector: 'app-my-trip',
  templateUrl: './my-trip.component.html',
  styleUrl: './my-trip.component.css'
})
export class MyTripComponent implements OnInit {
  trips: any[] = [];
  loading: boolean = true;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    this.loadTrips();
  }

  loadTrips(): void {
    this.loading = true;

    // Load from local storage
    const localTrips: any[] = JSON.parse(localStorage.getItem('my_trips') || '[]');

    // Also fetch from backend
    this.http.get(`${API_BASE_URL}booking`).subscribe({
      next: (serverBookings: any) => {
        this.loading = false;
        if (Array.isArray(serverBookings) && serverBookings.length > 0) {
          // Merge unique bookings
          const map = new Map<string, any>();
          [...localTrips, ...serverBookings].forEach(b => {
            const key = b._id || `${b.busId}-${b.seats?.join(',')}`;
            if (!map.has(key)) {
              map.set(key, b);
            }
          });
          this.trips = Array.from(map.values());
        } else {
          this.trips = localTrips;
        }

        if (this.trips.length === 0) {
          this.addDefaultDemoTrip();
        }
      },
      error: () => {
        this.loading = false;
        this.trips = localTrips;
        if (this.trips.length === 0) {
          this.addDefaultDemoTrip();
        }
      }
    });
  }

  addDefaultDemoTrip(): void {
    this.trips = [
      {
        _id: 'TB-789412',
        operatorName: 'TedBus Zingbus Gold',
        departureCity: 'Delhi',
        arrivalCity: 'Jaipur',
        departureTime: 6,
        arrivalTime: 11,
        date: '2026-11-05',
        seats: [14, 15],
        fare: 900,
        passengerDetails: [
          { name: 'Alex Johnson', gender: 'Male', age: 28, seatNumber: 14 },
          { name: 'Sam Johnson', gender: 'Female', age: 26, seatNumber: 15 }
        ]
      }
    ];
  }

  cancelTrip(index: number): void {
    const trip = this.trips[index];
    if (confirm('Are you sure you want to cancel this booking? A refund will be credited to your TedBus wallet.')) {
      if (trip && trip._id) {
        this.http.put(`${API_BASE_URL}booking/${trip._id}/cancel`, {}).subscribe({
          next: () => console.log('Booking cancelled on server'),
          error: (e) => console.warn('Offline cancel fallback:', e)
        });
      }
      this.trips[index].status = 'cancelled';
      localStorage.setItem('my_trips', JSON.stringify(this.trips));
      alert('Booking cancelled successfully. Refund initiated to source payment.');
    }
  }

  printTicket(trip: any): void {
    window.print();
  }

  bookNew(): void {
    this.router.navigate(['/']);
  }
}
