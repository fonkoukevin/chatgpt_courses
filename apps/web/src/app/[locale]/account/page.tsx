import { accountPage, authMetadata } from "@/components/auth/pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = authMetadata("en", "account");
export default accountPage("en");
