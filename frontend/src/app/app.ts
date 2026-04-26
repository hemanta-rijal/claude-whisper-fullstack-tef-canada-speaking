import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App implements OnInit {
  // LEARN: inject() is the modern Angular alternative to constructor injection.
  // It works anywhere inside an injection context (component, service, guard).
  auth = inject(AuthService);

  ngOnInit(): void {
    // Check if the user already has a valid session before showing any page.
    // This prevents a flash of the login page on refresh when already logged in.
    this.auth.init();
  }
}
