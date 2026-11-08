import { forLocale, PublicActivityPage, activityMetadata } from "@/components/public/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const generateMetadata = forLocale(activityMetadata, "fr");
export default forLocale(PublicActivityPage, "fr");
