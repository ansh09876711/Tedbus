import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Customer } from '../model/customer.model';
import { url } from '../config';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private apiurl: string = url + 'customer/';

  constructor(private http: HttpClient) { }

  addcustomermongo(user: any): Observable<Customer> {
    const customer: any = {
      name: user.name,
      email: user.email,
      password: user.password,
      googleId: user.id || user.googleId,
      profilepicture: user.picture || user.profilepicture || user.profilePicture
    };
    return this.http.post<Customer>(this.apiurl, customer);
  }
}
