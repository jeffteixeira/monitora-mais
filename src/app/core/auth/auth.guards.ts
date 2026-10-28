import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { OrgStore } from '../org/org.store';
import { AuthStore } from './auth.store';

// `inject()` só funciona de forma síncrona: dependências são obtidas antes de qualquer `await`.
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();
  return (
    auth.isAuthenticated() ||
    router.createUrlTree(['/entrar'], { queryParams: { redirect: state.url } })
  );
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const org = inject(OrgStore);
  const router = inject(Router);
  await auth.whenReady();
  return !auth.isAuthenticated() || router.parseUrl(await org.homeUrl());
};
