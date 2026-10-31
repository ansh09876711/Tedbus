export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/',
  // Google OAuth 2.0 Web Client ID (safe to expose in browser; never expose Client Secret here)
  googleClientId: '516929954818-jr4ns8vssalh676heifk40dek11pjoer.apps.googleusercontent.com',
  // Map provider configuration for Interactive Route Planner
  mapProvider: 'osm-vector-hybrid',
  mapTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};
