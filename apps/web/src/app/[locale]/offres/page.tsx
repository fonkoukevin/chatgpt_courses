import { offersMetadata, offersPage } from "@/components/commerce/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const generateMetadata = offersMetadata("fr");
export default offersPage("fr");
