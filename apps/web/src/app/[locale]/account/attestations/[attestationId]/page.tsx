import { accountAttestationPage, accountMetadata } from "@/components/account/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = accountMetadata("en", "attestations");
export default accountAttestationPage("en");
