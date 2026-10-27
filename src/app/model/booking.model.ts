export interface Booking {
  _id?: string;
  id?: string;
  customerId: string;
  passengerDetails: Passenger[];
  email: string;
  phoneNumber: string;
  fare: number;
  status: string;
  bookingDate: string;
  busId: string;
  seats: number[];
  departureDetails: TripDetails;
  arrivalDetails: TripDetails;
  duration: string;
  isBusinessTravel?: boolean;
  businessDetails?: BusinessDetails;
  isInsurance?: boolean;
  isCovidDonated?: boolean;
}

export interface Passenger {
  name: string;
  gender: string;
  age: number;
}

export interface TripDetails {
  city: string;
  location?: string;
  time: number | string;
  date?: string;
}

export interface BusinessDetails {
  gst?: string;
  name?: string;
  address?: string;
  email?: string;
}
