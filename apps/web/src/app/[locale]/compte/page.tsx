import { accountPage, authMetadata } from "@/components/auth/pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = authMetadata("fr", "account");
export default accountPage("fr");
