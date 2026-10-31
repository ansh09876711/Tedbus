/**
 * Production Environment Configuration
 *
 * PLACEHOLDER: Update 'apiUrl' with your production backend URL once deployed
 * (e.g., 'https://api.tedbus.com/' or 'https://tedbus-backend.onrender.com/').
 */
export const environment = {
  production: true,
  apiUrl: 'https://tedbus-tau.vercel.app/',
  // Google OAuth 2.0 Web Client ID — update if using a separate OAuth app for production
  googleClientId: '516929954818-jr4ns8vssalh676heifk40dek11pjoer.apps.googleusercontent.com',
  // Map provider configuration for Interactive Route Planner
  mapProvider: 'osm-vector-hybrid',
  mapTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};
