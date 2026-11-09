import { offerMetadata, offerPage } from "@/components/commerce/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const generateMetadata = offerMetadata("en");
export default offerPage("en");
