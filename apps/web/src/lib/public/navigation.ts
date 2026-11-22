import type { AuthResult } from "../api/auth-client";
import type { CatalogueFacets, OfferPage } from "../api/generated/types.gen";

export type PublicNavigationAvailability = { methods: boolean; guides: boolean; offers: boolean };

export const emptyPublicNavigation: PublicNavigationAvailability = { methods: false, guides: false, offers: false };

export function publicNavigationAvailability(facets: AuthResult<CatalogueFacets>, offers: AuthResult<OfferPage>): PublicNavigationAvailability {
  return {
    methods: facets.ok && facets.data.types.some((item) => item.code === "METHOD_TEMPLATE" && item.count > 0),
    guides: facets.ok && facets.data.types.some((item) => item.code === "GUIDE" && item.count > 0),
    offers: offers.ok && offers.data.total > 0,
  };
}
