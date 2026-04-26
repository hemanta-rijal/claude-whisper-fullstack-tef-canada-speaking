import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { routes } from './app.routes';

// Interceptor: automatically adds `withCredentials: true` to every request.
// LEARN: withCredentials tells the browser to send the session cookie cross-origin.
// Without this, the `sid` cookie won't be included in requests to localhost:3000.
function credentialsInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  return next(req.clone({ withCredentials: true }));
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([credentialsInterceptor]),
    ),
  ],
};
