import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DataService } from '../../service/dataservice.service';
import { API_BASE_URL } from '../../config';

@Component({
  selector: 'app-payment-page',
  templateUrl: './payment-page.component.html',
  styleUrl: './payment-page.component.css'
})
export class PaymentPageComponent implements OnInit {
  bookingData: any = null;
  selectedPaymentMethod: string = 'card';
  paymentProcessing: boolean = false;
  paymentSuccess: boolean = false;
  confirmedBookingId: string = '';
  errorMessage: string = '';

  // Card form fields
  cardNumber: string = '';
  cardHolder: string = '';
  expiryDate: string = '';
  cvv: string = '';

  // UPI fields
  upiId: string = '';

  // Netbanking
  selectedBank: string = 'HDFC';

  constructor(
    private dataService: DataService,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.dataService.currentData.subscribe(data => {
      if (data && data.seats) {
        this.bookingData = data;
      } else {
        const stored = localStorage.getItem('pendingBooking');
        if (stored) {
          try {
            this.bookingData = JSON.parse(stored);
          } catch (e) {
            this.bookingData = null;
          }
        }
      }
    });

    // Fallback sample data if direct URL access
    if (!this.bookingData) {
      this.bookingData = {
        busId: '659a1b2c3d4e5f6a7b8c9d01',
        operatorName: 'TedBus Premier Express',
        route: {
          departureLocation: { name: 'Delhi' },
          arrivalLocation: { name: 'Jaipur' },
          duration: 5
        },
        departureTime: 6,
        arrivalTime: 11,
        seats: [12, 13],
        seatPrice: 450,
        totalAmount: 900,
        email: 'passenger@example.com',
        phoneNumber: '9876543210',
        passengers: [
          { name: 'Alex Johnson', gender: 'Male', age: 28, seatNumber: 12 },
          { name: 'Sam Johnson', gender: 'Female', age: 26, seatNumber: 13 }
        ],
        date: new Date().toISOString().split('T')[0]
      };
    }
  }

  selectMethod(method: string): void {
    this.selectedPaymentMethod = method;
  }

  processPayment(): void {
    this.paymentProcessing = true;

    let customerId = 'guest-' + Date.now();
    try {
      const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
      if (user._id || user.email || user.googleId) {
        customerId = user._id || user.googleId || user.email;
      }
    } catch (e) {}

    const payload = {
      customerId: customerId,
      busId: this.bookingData.busId,
      seats: this.bookingData.seats,
      passengerDetails: this.bookingData.passengers,
      email: this.bookingData.email,
      phoneNumber: this.bookingData.phoneNumber,
      fare: this.bookingData.totalAmount,
      status: 'confirmed',
      date: this.bookingData.date || new Date().toISOString().split('T')[0],
      departureTime: this.bookingData.departureTime,
      arrivalTime: this.bookingData.arrivalTime,
      operatorName: this.bookingData.operatorName,
      departureCity: this.bookingData.route?.departureLocation?.name || 'Origin',
      arrivalCity: this.bookingData.route?.arrivalLocation?.name || 'Destination'
    };

    this.errorMessage = '';
    // Save to server
    this.http.post(`${API_BASE_URL}booking`, payload).subscribe({
      next: (res: any) => {
        if (!res || !res._id) {
          this.paymentProcessing = false;
          this.paymentSuccess = false;
          this.errorMessage = 'Booking confirmation failed: Server did not return a valid persistent booking confirmation.';
          return;
        }
        this.paymentProcessing = false;
        this.paymentSuccess = true;
        this.errorMessage = '';
        this.confirmedBookingId = String(res._id);
        this.saveToLocalTrips(payload, this.confirmedBookingId);
      },
      error: (err: any) => {
        this.paymentProcessing = false;
        this.paymentSuccess = false;
        this.errorMessage = err?.error?.message || 'Payment processing failed: the booking could not be saved to the database. Your card was not charged.';
      }
    });
  }

  saveToLocalTrips(payload: any, bookingId: string): void {
    const existing = JSON.parse(localStorage.getItem('my_trips') || '[]');
    existing.unshift({
      ...payload,
      _id: bookingId,
      bookingDate: new Date().toISOString()
    });
    localStorage.setItem('my_trips', JSON.stringify(existing));
    localStorage.removeItem('pendingBooking');
  }

  goToTrips(): void {
    this.router.navigate(['/profile']);
  }
}
