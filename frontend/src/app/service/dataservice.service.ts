import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataserviceService {
  private datasource = new BehaviorSubject<any>(null);
  currentdata = this.datasource.asObservable();
  currentData = this.datasource.asObservable();

  constructor() { }

  sendobj(obj: any) {
    this.datasource.next(obj);
  }

  setData(obj: any) {
    this.datasource.next(obj);
  }

  getData(): any {
    return this.datasource.getValue();
  }
}

export const DataService = DataserviceService;
export type DataService = DataserviceService;
