import { forLocale, PublicCataloguePage, catalogueMetadata } from "@/components/public/server-pages";
export const generateMetadata = forLocale(catalogueMetadata, "en");
export default forLocale(PublicCataloguePage, "en");
