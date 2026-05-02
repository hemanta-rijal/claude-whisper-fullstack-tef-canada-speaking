import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { routes } from './app.routes';
import { ThemeService } from './services/theme.service';
import { shellReducer } from './shared/state/shell/shell.reducer';

function credentialsInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  return next(req.clone({ withCredentials: true }));
}

/** Apply saved light/dark before first route renders — avoids theme flash on refresh. */
export function themeInitializer(theme: ThemeService): () => void {
  return () => {
    theme.hydrateFromStorage();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    /** LEARN: Root Store holds feature slices; shell reducer drives shared header text via Observables. */
    provideStore({ shell: shellReducer }),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([credentialsInterceptor]),
    ),
    {
      provide: APP_INITIALIZER,
      useFactory: themeInitializer,
      deps: [ThemeService],
      multi: true,
    },
  ],
};
