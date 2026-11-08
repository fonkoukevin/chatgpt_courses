import { orderRefundsPage, refundsMetadata } from "@/components/refunds/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = refundsMetadata("fr");
export default orderRefundsPage("fr");
