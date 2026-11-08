import { commerceMetadata, ordersPage } from "@/components/commerce/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = commerceMetadata("en", true);
export default ordersPage("en");
