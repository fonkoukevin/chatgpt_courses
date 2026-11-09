import { accountHomePage, accountMetadata } from "@/components/account/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = accountMetadata("en");
export default accountHomePage("en");
