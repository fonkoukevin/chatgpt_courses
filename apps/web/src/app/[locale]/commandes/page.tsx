import { commerceMetadata, ordersPage } from "@/components/commerce/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = commerceMetadata("fr", true);
export default ordersPage("fr");
