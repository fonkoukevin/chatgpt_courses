import { methodNewPage, methodsMetadata } from "@/components/methods/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = methodsMetadata("en", true);
export default methodNewPage("en");
