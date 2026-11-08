import { forLocale, PublicCataloguePage, catalogueMetadata } from "@/components/public/server-pages";
export const generateMetadata = forLocale(catalogueMetadata, "fr");
export default forLocale(PublicCataloguePage, "fr");
