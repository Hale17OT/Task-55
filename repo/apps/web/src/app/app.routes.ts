import { Routes } from '@angular/router';
import { ShellComponent } from './core/layout/shell.component';
import { NotFoundComponent } from './core/layout/not-found.component';
import { ForbiddenComponent } from './core/layout/forbidden.component';
import { authGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'forbidden',
    component: ShellComponent,
    children: [{ path: '', component: ForbiddenComponent }],
  },
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'offerings',
        // No auth guard — guests can browse public offerings (API handles visibility filtering)
        loadComponent: () => import('./features/offerings/offerings.component').then(m => m.OfferingsComponent),
      },
      {
        path: 'events',
        canActivate: [authGuard, roleGuard('merchant', 'operations', 'client')],
        loadComponent: () => import('./features/events/events.component').then(m => m.EventsComponent),
      },
      {
        path: 'portfolio',
        canActivate: [authGuard, roleGuard('merchant')],
        loadComponent: () => import('./features/portfolio/portfolio.component').then(m => m.PortfolioComponent),
      },
      {
        path: 'dashboard',
        canActivate: [authGuard, roleGuard('operations')],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'data-quality',
        canActivate: [authGuard, roleGuard('operations')],
        loadComponent: () => import('./features/data-quality/data-quality.component').then(m => m.DataQualityComponent),
      },
      {
        path: 'admin',
        canActivate: [authGuard, roleGuard('administrator')],
        loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent),
      },
      { path: '**', component: NotFoundComponent },
    ],
  },
];
