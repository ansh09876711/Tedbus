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

  private getAuthenticatedUser(): { customerId: string; email: string; authToken: string } | null {
    try {
      const raw = sessionStorage.getItem('Loggedinuser') || localStorage.getItem('currentUser');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const customerId = String(parsed?._id || parsed?.id || parsed?.googleId || '').trim();
      const email = String(parsed?.email || '').trim().toLowerCase();
      const authToken = String(sessionStorage.getItem('AuthToken') || parsed?.authToken || '').trim();
      if ((!customerId && !email) || !authToken) return null;
      return { customerId, email, authToken };
    } catch {
      return null;
    }
  }

  loadTrips(): void {
    this.loading = true;
    const authUser = this.getAuthenticatedUser();

    // Load local storage trips scoped to the authenticated user
    const allLocalTrips: any[] = JSON.parse(localStorage.getItem('my_trips') || '[]');
    const localTrips = authUser
      ? allLocalTrips.filter(b => {
          const bCust = String(b.customerId || '').trim();
          const bEmail = String(b.email || '').trim().toLowerCase();
          return (authUser.customerId && bCust === authUser.customerId) ||
                 (authUser.email && bEmail === authUser.email);
        })
      : [];

    // Do not request server bookings if user is not authenticated
    if (!authUser) {
      this.loading = false;
      this.trips = [];
      return;
    }

    // AuthInterceptor attaches Authorization: Bearer <token>; backend derives customer identity from verified JWT
    this.http.get(`${API_BASE_URL}booking`).subscribe({
      next: (serverBookings: any) => {
        this.loading = false;
        if (Array.isArray(serverBookings) && serverBookings.length > 0) {
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
      },
      error: () => {
        this.loading = false;
        this.trips = localTrips;
      }
    });
  }

  cancelTrip(index: number): void {
    const trip = this.trips[index];
    const authUser = this.getAuthenticatedUser();
    if (!trip) return;

    if (confirm('Are you sure you want to cancel this booking? A refund will be initiated to your source payment method.')) {
      if (trip._id) {
        this.http.put(`${API_BASE_URL}booking/${trip._id}/cancel`, {}).subscribe({
          next: () => {
            this.trips[index].status = 'cancelled';
            localStorage.setItem('my_trips', JSON.stringify(this.trips));
            alert('Booking cancelled successfully. Refund initiated to source payment.');
          },
          error: (err) => {
            const msg = err?.error?.message || 'Unable to cancel booking.';
            alert(msg);
          }
        });
      } else {
        this.trips[index].status = 'cancelled';
        localStorage.setItem('my_trips', JSON.stringify(this.trips));
        alert('Booking cancelled successfully.');
      }
    }
  }

  printTicket(trip: any): void {
    window.print();
  }

  bookNew(): void {
    this.router.navigate(['/']);
  }
}
