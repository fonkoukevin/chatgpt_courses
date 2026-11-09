import { accountHelpPage, accountMetadata } from "@/components/account/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = accountMetadata("en", "help");
export default accountHelpPage("en");
