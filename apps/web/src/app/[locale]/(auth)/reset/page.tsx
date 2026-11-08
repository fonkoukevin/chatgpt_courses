import { authMetadata, authPage } from "@/components/auth/pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = authMetadata("en", "recover");
export default authPage("recover", "en");
