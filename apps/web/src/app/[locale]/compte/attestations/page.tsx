import { accountAttestationsPage, accountMetadata } from "@/components/account/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = accountMetadata("fr", "attestations");
export default accountAttestationsPage("fr");
