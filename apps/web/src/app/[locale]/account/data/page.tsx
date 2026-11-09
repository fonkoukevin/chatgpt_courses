import { accountDataRequestsPage, accountMetadata } from "@/components/account/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = accountMetadata("en", "data");
export default accountDataRequestsPage("en");
