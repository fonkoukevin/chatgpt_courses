import { authMetadata, authPage } from "@/components/auth/pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = authMetadata("fr", "sign-in");
export default authPage("sign-in", "fr");
