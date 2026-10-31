import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { DialogComponent } from './dialog/dialog.component';

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css'
})
export class LandingPageComponent implements OnInit, OnDestroy {
  fromoption: string = '';
  tooption: string = '';
  date: string = '';
  activeOfferTab: string = 'all';
  openFaqIndex: number | null = 0;
  copiedCouponCode: string = '';
  couponFeedbackMessage: string = '';
  private couponFeedbackTimer: any;

  readonly validPromoCodes: Record<string, string> = {
    FIRST: 'Flat 10% OFF on your first bus booking',
    SUPERHIT: 'Flat ₹150 OFF on AC Sleeper bookings',
    BUS300: 'Save up to ₹300 on highway routes',
    RBTRIP: 'Flat ₹125 OFF on return journey bookings',
    WALLET: 'Flat ₹100 OFF instant promotional discount'
  };

  stats = [
    { icon: 'directions_bus', value: 'Verified', label: 'Fleet Operators' },
    { icon: 'alt_route', value: '6+ Corridors', label: 'Major Intercity Routes' },
    { icon: 'star', value: '4.6 / 5', label: 'Verified Journey Reviews' },
    { icon: 'gps_fixed', value: '24/7 Live', label: 'Route & Seat Tracking' }
  ];

  whyUs = [
    { icon: 'verified_user', color: 'from-red-500 to-rose-600', title: 'Verified Operators', desc: 'Every listed coach operator meets strict safety, punctuality, and comfort standards.' },
    { icon: 'currency_rupee', color: 'from-emerald-500 to-teal-600', title: 'Transparent Pricing', desc: 'Clear base fares with zero hidden convenience fees on seat reservations.' },
    { icon: 'support_agent', color: 'from-blue-500 to-indigo-600', title: '24/7 Journey Support', desc: 'Bilingual traveler assistance and real-time route notifications at every step.' },
    { icon: 'replay', color: 'from-amber-500 to-orange-600', title: 'Hassle-Free Cancellation', desc: 'Cancel eligible tickets up to 2 hours before departure with automated refund tracking.' }
  ];

  popularRoutes = [
    { from: 'Delhi', to: 'Jaipur', duration: '5h 30m', price: '₹349', icon: 'location_city' },
    { from: 'Mumbai', to: 'Goa', duration: '8h', price: '₹599', icon: 'beach_access' },
    { from: 'Bangalore', to: 'Mysore', duration: '3h', price: '₹199', icon: 'account_balance' },
    { from: 'Kolkata', to: 'Darjeeling', duration: '10h', price: '₹699', icon: 'landscape' },
    { from: 'Chennai', to: 'Pondicherry', duration: '3h 30m', price: '₹249', icon: 'directions_boat' },
    { from: 'Delhi', to: 'Agra', duration: '4h', price: '₹299', icon: 'museum' }
  ];

  busImages: string[] = [
    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1920&q=80'
  ];
  currentImageIndex: number = 0;
  private imageInterval: any;

  constructor(private router: Router, public dialog: MatDialog) { }

  ngOnInit(): void {
    this.startBackgroundSlideshow();
  }

  ngOnDestroy(): void {
    if (this.imageInterval) {
      clearInterval(this.imageInterval);
    }
    if (this.couponFeedbackTimer) {
      clearTimeout(this.couponFeedbackTimer);
    }
  }

  copyCouponCode(code: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const normalized = (code || '').trim().toUpperCase();
    if (!normalized || !this.validPromoCodes[normalized]) {
      this.couponFeedbackMessage = 'This promotional code is not valid or no longer supported.';
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(normalized).catch(() => {});
    }
    try {
      localStorage.setItem('copiedPromoCode', normalized);
    } catch {}

    this.copiedCouponCode = normalized;
    this.couponFeedbackMessage = `Code "${normalized}" copied to clipboard — ${this.validPromoCodes[normalized]}`;

    if (this.couponFeedbackTimer) {
      clearTimeout(this.couponFeedbackTimer);
    }
    this.couponFeedbackTimer = setTimeout(() => {
      this.copiedCouponCode = '';
      this.couponFeedbackMessage = '';
    }, 3500);
  }

  startBackgroundSlideshow(): void {
    this.imageInterval = setInterval(() => {
      this.currentImageIndex = (this.currentImageIndex + 1) % this.busImages.length;
    }, 4500);
  }

  setSlide(index: number): void {
    this.currentImageIndex = index;
    if (this.imageInterval) {
      clearInterval(this.imageInterval);
      this.startBackgroundSlideshow();
    }
  }

  nextSlide(): void {
    this.setSlide((this.currentImageIndex + 1) % this.busImages.length);
  }

  prevSlide(): void {
    this.setSlide((this.currentImageIndex - 1 + this.busImages.length) % this.busImages.length);
  }

  fromEvent(option: string) {
    this.fromoption = option;
  }

  toEvent(option: string) {
    this.tooption = option;
  }

  swapCities(): void {
    const temp = this.fromoption;
    this.fromoption = this.tooption;
    this.tooption = temp;
  }

  toggleFaq(index: number): void {
    this.openFaqIndex = this.openFaqIndex === index ? null : index;
  }

  bookRoute(route: any): void {
    this.fromoption = route.from;
    this.tooption = route.to;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  matchDate(event: any) {
    if (event.value) {
      const date = new Date(event.value);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear().toString();
      this.date = `${year}-${month}-${day}`;
    } else {
      this.date = 'null';
    }
  }

  openRoutesDialog(): void {
    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        date: this.date,
        from: this.fromoption,
        to: this.tooption
      },
      width: '640px'
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && result.from && result.to) {
        this.fromoption = result.from;
        this.tooption = result.to;
      }
    });
  }

  submit() {
    // If user has specified departure and arrival, navigate directly to select-bus
    if (this.fromoption && this.tooption) {
      let travelDate = this.date;
      if (!travelDate || travelDate === 'null') {
        const today = new Date();
        const day = today.getDate().toString().padStart(2, '0');
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const year = today.getFullYear().toString();
        travelDate = `${year}-${month}-${day}`;
      }
      this.router.navigate(['/select-bus'], {
        queryParams: {
          departure: this.fromoption.trim(),
          arrival: this.tooption.trim(),
          date: travelDate
        }
      });
    } else {
      // If any field is missing, open the dialog showing available bus routes
      this.openRoutesDialog();
    }
  }
}
