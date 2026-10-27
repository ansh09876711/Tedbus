import { Component, Inject, Optional } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.component.html',
  styleUrl: './dialog.component.css'
})
export class DialogComponent {
  dataSource = Element_data;
  displayedColumns: string[] = ['position', 'from', 'to', 'nobus', 'action'];

  constructor(
    private router: Router,
    public dialogRef: MatDialogRef<DialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  viewBus(element: any): void {
    let travelDate = this.data?.date;
    if (!travelDate || travelDate === 'null') {
      const today = new Date();
      const day = today.getDate().toString().padStart(2, '0');
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const year = today.getFullYear().toString();
      travelDate = `${year}-${month}-${day}`;
    }

    this.dialogRef.close(element);
    this.router.navigate(['/select-bus'], {
      queryParams: {
        departure: element.from,
        arrival: element.to,
        date: travelDate
      }
    });
  }
}

const Element_data: any[] = [
  { position: 1, from: 'Bangalore', to: 'Darjeeling', nobus: 3 },
  { position: 2, from: 'Delhi', to: 'Jaipur', nobus: 2 },
  { position: 3, from: 'Mumbai', to: 'Goa', nobus: 2 },
  { position: 4, from: 'Bangalore', to: 'Mysore', nobus: 2 },
  { position: 5, from: 'Kolkata', to: 'Darjeeling', nobus: 2 },
  { position: 6, from: 'Chennai', to: 'Pondicherry', nobus: 2 },
  { position: 7, from: 'Bangalore', to: 'Goa', nobus: 3 },
  { position: 8, from: 'Delhi', to: 'Darjeeling', nobus: 2 },
];
