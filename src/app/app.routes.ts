import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guards';
import { adminGuard, homeGuard, legacyRedirect, orgGuard } from './core/org/org.guards';

// URLs da versão single-tenant (antes de `/o/:slug`): redirecionam para a última organização usada.
const legacyPaths = [
  'inicio',
  'explorar',
  'sessoes',
  'sessoes/:id',
  'monitorar',
  'carteira',
  'ranking',
  'perfil',
  'monitores/:id',
];

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Monitora+ · Banco de tempo acadêmico',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'entrar',
    title: 'Entrar · Monitora+',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'cadastro',
    title: 'Criar conta · Monitora+',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signup').then((m) => m.Signup),
  },
  { path: 'app', canActivate: [homeGuard], children: [] },
  {
    path: 'organizacoes',
    title: 'Minhas organizações · Monitora+',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/organizations/organizations').then((m) => m.Organizations),
  },
  {
    path: 'convite/:code',
    title: 'Convite · Monitora+',
    canActivate: [authGuard],
    loadComponent: () => import('./features/invite/invite').then((m) => m.Invite),
  },
  {
    // Fora do Shell: a chamada ocupa a tela toda e não deixa o menu do app acessível por baixo.
    path: 'o/:slug/sessoes/:id/chamada',
    title: 'Chamada · Monitora+',
    canActivate: [authGuard, orgGuard],
    loadComponent: () => import('./features/sessions/call/call-room').then((m) => m.CallRoom),
  },
  {
    path: 'o/:slug',
    canActivate: [authGuard, orgGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Início · Monitora+',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        path: 'explorar',
        title: 'Explorar monitorias · Monitora+',
        loadComponent: () => import('./features/explore/explore').then((m) => m.Explore),
      },
      {
        path: 'monitores/:id',
        title: 'Perfil do monitor · Monitora+',
        loadComponent: () =>
          import('./features/monitor-profile/monitor-profile').then((m) => m.MonitorProfile),
      },
      {
        path: 'sessoes',
        title: 'Minhas sessões · Monitora+',
        loadComponent: () => import('./features/sessions/sessions').then((m) => m.Sessions),
      },
      {
        path: 'sessoes/:id',
        title: 'Sessão · Monitora+',
        loadComponent: () =>
          import('./features/sessions/session-detail').then((m) => m.SessionDetail),
      },
      {
        path: 'monitorar',
        title: 'Monitorar · Monitora+',
        loadComponent: () => import('./features/teach/teach').then((m) => m.Teach),
      },
      {
        path: 'carteira',
        title: 'Carteira · Monitora+',
        loadComponent: () => import('./features/wallet/wallet').then((m) => m.Wallet),
      },
      {
        path: 'ranking',
        title: 'Ranking · Monitora+',
        loadComponent: () => import('./features/ranking/ranking').then((m) => m.Ranking),
      },
      {
        path: 'perfil',
        title: 'Meu perfil · Monitora+',
        loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'admin',
        title: 'Administração · Monitora+',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
      },
    ],
  },
  ...legacyPaths.map((path) => ({ path, redirectTo: legacyRedirect })),
  { path: '**', redirectTo: '' },
];
