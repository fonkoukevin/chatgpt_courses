import { entitlementsPage, refundsMetadata } from "@/components/refunds/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = refundsMetadata("fr", "entitlements");
export default entitlementsPage("fr");
