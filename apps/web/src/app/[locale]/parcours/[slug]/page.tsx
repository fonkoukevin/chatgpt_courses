import { forLocale, PublicCoursePage, detailMetadata } from "@/components/public/server-pages";
export const generateMetadata = forLocale(detailMetadata("COURSE"), "fr");
export default forLocale(PublicCoursePage, "fr");
