import { forLocale, PublicCoursePage, detailMetadata } from "@/components/public/server-pages";
export const generateMetadata = forLocale(detailMetadata("COURSE"), "en");
export default forLocale(PublicCoursePage, "en");
