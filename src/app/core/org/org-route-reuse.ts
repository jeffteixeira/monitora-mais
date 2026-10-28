import { type ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

const slugOf = (route: ActivatedRouteSnapshot): string | undefined =>
  route.pathFromRoot.map((r) => r.params['slug'] as string | undefined).find(Boolean);

/** Trocar de organização recria as telas, para que nada da organização anterior sobreviva. */
export class OrgRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return super.shouldReuseRoute(future, curr) && slugOf(future) === slugOf(curr);
  }
}
