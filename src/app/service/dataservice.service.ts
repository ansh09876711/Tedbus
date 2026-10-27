import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataserviceService {
  private datasource = new BehaviorSubject<any>(null);
  currentdata = this.datasource.asObservable();
  currentData = this.datasource.asObservable();

  private passdetails = new BehaviorSubject<any>(null);
  passdata = this.passdetails.asObservable();

  constructor() { }

  sendobj(obj: any) {
    this.datasource.next(obj);
  }

  passobj(obj: any) {
    this.passdetails.next(obj);
  }

  setData(obj: any) {
    this.datasource.next(obj);
  }

  getData(): any {
    return this.datasource.getValue();
  }
}

// Alias for convenience
export const DataService = DataserviceService;
export type DataService = DataserviceService;
