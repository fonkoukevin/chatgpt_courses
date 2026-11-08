import { authMetadata, authPage } from "@/components/auth/pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = authMetadata("en", "sign-up");
export default authPage("sign-up", "en");
