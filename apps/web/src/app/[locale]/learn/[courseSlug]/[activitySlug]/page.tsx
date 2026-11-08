import { forLocale, PublicActivityPage, activityMetadata } from "@/components/public/server-pages";
export const generateMetadata = forLocale(activityMetadata, "en");
export default forLocale(PublicActivityPage, "en");
