// Production environment — swapped in automatically by angular.json fileReplacements.
// Change apiUrl to your deployed backend URL before running `ng build`.
export const environment = {
  production: true,
  // Nginx proxies /api/* → backend:3000/* — no cross-origin, no CORS needed.
  apiUrl: '/api',
};
