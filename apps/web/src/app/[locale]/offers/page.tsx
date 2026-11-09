import { offersMetadata, offersPage } from "@/components/commerce/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const generateMetadata = offersMetadata("en");
export default offersPage("en");
