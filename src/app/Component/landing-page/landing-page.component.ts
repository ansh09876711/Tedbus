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

  stats = [
    { icon: 'directions_bus', value: '3,000+', label: 'Bus Operators' },
    { icon: 'alt_route', value: '1,00,000+', label: 'Routes Covered' },
    { icon: 'star', value: '4.8 ★', label: 'App Rating' },
    { icon: 'groups', value: '25 Lakh+', label: 'Happy Travellers' }
  ];

  whyUs = [
    { icon: 'verified_user', color: 'from-red-500 to-rose-600', title: 'Verified Operators', desc: 'Every bus operator is KYC verified with safety standards checked before listing.' },
    { icon: 'currency_rupee', color: 'from-emerald-500 to-teal-600', title: 'Best Price Guarantee', desc: 'We scan 3,000+ operators to guarantee you the lowest fare, every single time.' },
    { icon: 'support_agent', color: 'from-blue-500 to-indigo-600', title: '24/7 Live Support', desc: 'Round-the-clock multilingual support via chat, call, or email for any issue.' },
    { icon: 'replay', color: 'from-amber-500 to-orange-600', title: 'Instant Refunds', desc: 'Cancel anytime and get 100% automated refund directly to your source account.' }
  ];

  popularRoutes = [
    { from: 'Delhi', to: 'Jaipur', duration: '5h 30m', price: '₹349', icon: '🏰' },
    { from: 'Mumbai', to: 'Goa', duration: '8h', price: '₹599', icon: '🏖️' },
    { from: 'Bangalore', to: 'Mysore', duration: '3h', price: '₹199', icon: '🏯' },
    { from: 'Kolkata', to: 'Darjeeling', duration: '10h', price: '₹699', icon: '🏔️' },
    { from: 'Chennai', to: 'Pondicherry', duration: '3h 30m', price: '₹249', icon: '⛵' },
    { from: 'Delhi', to: 'Agra', duration: '4h', price: '₹299', icon: '🕌' }
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
