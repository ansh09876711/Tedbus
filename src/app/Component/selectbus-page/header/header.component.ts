import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {
  departure: string = '';
  arrival: string = '';
  date: string = '';
  displayDate: string = '';
  dayOfWeek: string = '';
  showModifySearch: boolean = false;

  // Editable fields for modify search
  editDeparture: string = '';
  editArrival: string = '';
  editDate: string = '';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.departure = params['departure'] || '';
      this.arrival = params['arrival'] || '';
      this.date = params['date'] || '';
      this.formatDate();
      this.editDeparture = this.departure;
      this.editArrival = this.arrival;
      this.editDate = this.date;
    });
  }

  formatDate(): void {
    if (this.date) {
      const d = new Date(this.date);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      this.dayOfWeek = days[d.getDay()];
      this.displayDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  }

  swapCities(): void {
    const temp = this.editDeparture;
    this.editDeparture = this.editArrival;
    this.editArrival = temp;
  }

  toggleModifySearch(): void {
    this.showModifySearch = !this.showModifySearch;
    if (this.showModifySearch) {
      this.editDeparture = this.departure;
      this.editArrival = this.arrival;
      this.editDate = this.date;
    }
  }

  changeDate(offset: number): void {
    const current = new Date(this.date);
    current.setDate(current.getDate() + offset);
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const newDate = `${yyyy}-${mm}-${dd}`;
    this.router.navigate(['/select-bus'], {
      queryParams: { departure: this.departure, arrival: this.arrival, date: newDate }
    });
  }

  applyModifiedSearch(): void {
    if (this.editDeparture.trim() && this.editArrival.trim()) {
      let travelDate = this.editDate;
      if (!travelDate) {
        const today = new Date();
        travelDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      }
      this.showModifySearch = false;
      this.router.navigate(['/select-bus'], {
        queryParams: { departure: this.editDeparture.trim(), arrival: this.editArrival.trim(), date: travelDate }
      });
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
