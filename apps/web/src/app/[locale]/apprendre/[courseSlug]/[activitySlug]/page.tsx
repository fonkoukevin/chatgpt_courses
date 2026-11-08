import { forLocale, PublicActivityPage, activityMetadata } from "@/components/public/server-pages";
export const generateMetadata = forLocale(activityMetadata, "fr");
export default forLocale(PublicActivityPage, "fr");
