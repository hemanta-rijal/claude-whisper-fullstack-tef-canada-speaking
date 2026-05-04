import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login').then(m => m.Login) },
  { path: 'register', loadComponent: () => import('./pages/register/register').then(m => m.Register) },
  { path: 'forgot-password', loadComponent: () => import('./pages/forgot-password/forgot-password').then(m => m.ForgotPassword) },
  { path: 'reset-password', loadComponent: () => import('./pages/reset-password/reset-password').then(m => m.ResetPassword) },
  { path: 'verify-email', loadComponent: () => import('./pages/verify-email/verify-email').then(m => m.VerifyEmail) },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
  },
  {
    path: 'flashcards',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/flashcards/flashcards').then(m => m.Flashcards),
  },
  {
    path: 'vocabulary-builder',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/vocabulary-builder/vocabulary-builder').then(m => m.VocabularyBuilder),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/settings/settings').then(m => m.Settings),
  },
  {
    path: 'results',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/results-list/results-list').then(m => m.ResultsList),
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
