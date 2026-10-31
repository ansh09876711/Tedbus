export interface Bus {
  _id?: string;
  operatorName: string;
  busType: string;
  departureTime: string;
  rating: number[];
  totalSeats?: number;
  routes: string;
  images: string;
  liveTracking: number;
  reschedulable: number;
  boardingPoints?: string[];
  droppingPoints?: string[];
  amenities?: {
    wifi?: boolean;
    waterBottle?: boolean;
    blankets?: boolean;
    chargingPoint?: boolean;
    movie?: boolean;
  };
}
