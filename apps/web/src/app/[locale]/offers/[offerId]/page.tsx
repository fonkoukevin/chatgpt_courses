import { commerceMetadata, offerPage } from "@/components/commerce/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = commerceMetadata("en");
export default offerPage("en");
