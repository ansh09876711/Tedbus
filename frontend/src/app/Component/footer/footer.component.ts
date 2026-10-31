import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  constructor(private router: Router) {}

  searchRoute(departure: string, arrival: string): void {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    this.router.navigate(['/select-bus'], {
      queryParams: { departure, arrival, date: `${yyyy}-${mm}-${dd}` }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navigate(path: string): void {
    this.router.navigate([path]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
