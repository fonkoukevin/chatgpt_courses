import { forLocale, PublicMethodPage, detailMetadata } from "@/components/public/server-pages";
export const generateMetadata = forLocale(detailMetadata("METHOD_TEMPLATE"), "en");
export default forLocale(PublicMethodPage, "en");
