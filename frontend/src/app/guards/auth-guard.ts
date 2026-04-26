import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';

// LEARN: a guard can return an Observable — Angular waits for it to emit before
// allowing or blocking navigation. This lets us delay the guard's decision until
// auth.init() has finished checking the session with the backend.
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // toObservable() converts an Angular signal into an RxJS Observable.
  // LEARN: filter() only passes values where the predicate returns true.
  //        take(1) completes the Observable after the first matching value.
  //        map() transforms the emitted value into our guard's return value.
  return toObservable(auth.isLoading).pipe(
    filter(loading => !loading),   // wait until init() has finished
    take(1),                        // only act on the first emission after init
    map(() => {
      if (auth.currentUser()) return true;
      return router.createUrlTree(['/login']);
    }),
  );
};
