import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login').then(m => m.Login) },
  { path: 'register', loadComponent: () => import('./pages/register/register').then(m => m.Register) },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
  },
  {
    path: 'exam/select',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/section-select/section-select').then(m => m.SectionSelect),
  },
  {
    path: 'exam',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/exam/exam').then(m => m.Exam),
  },
  {
    path: 'results/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/result-detail/result-detail').then(m => m.ResultDetail),
  },
  { path: '**', redirectTo: 'dashboard' },
];
