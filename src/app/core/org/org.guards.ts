import { inject } from '@angular/core';
import { type CanActivateFn, type Route, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { OrgStore } from './org.store';

/** Resolve `/o/:slug`: só entra quem é membro ativo da organização. */
export const orgGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const org = inject(OrgStore);
  const router = inject(Router);
  const slug = route.paramMap.get('slug') ?? '';
  // guards do mesmo array rodam em paralelo: aguarda a sessão antes de consultar as organizações
  await auth.whenReady();
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/entrar']);
  }
  return (await org.select(slug)) || router.createUrlTree(['/organizacoes']);
};

export const adminGuard: CanActivateFn = () => {
  const org = inject(OrgStore);
  const router = inject(Router);
  return org.isAdmin() || router.createUrlTree(['/o', org.currentSlug(), 'inicio']);
};

/** Mantém URLs antigas (`/explorar`, `/sessoes/:id`...) funcionando: leva à última organização usada. */
export const legacyRedirect: Route['redirectTo'] = ({ url }) => {
  const slug = inject(OrgStore).lastSlug();
  const path = url.map((s) => s.path).join('/');
  return slug ? `/o/${slug}/${path}` : '/organizacoes';
};

const SHORTCUTS = ['explorar', 'carteira', 'sessoes', 'ranking', 'monitorar'];

/** Entrada do PWA instalado (`/app`): vai para a última organização, respeitando atalhos (`?to=`). */
export const homeGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthStore);
  const org = inject(OrgStore);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/entrar'], { queryParams: { redirect: state.url } });
  }
  const to = route.queryParamMap.get('to');
  const home = await org.homeUrl();
  return router.parseUrl(
    to && SHORTCUTS.includes(to) && home.startsWith('/o/') ? home.replace(/inicio$/, to) : home,
  );
};
