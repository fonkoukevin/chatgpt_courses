import { authMetadata, authPage } from "@/components/auth/pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = authMetadata("fr", "reset");
export default authPage("reset", "fr");
