import { orderPaymentStatusPage, paymentStatusMetadata } from "@/components/commerce/server-pages";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = paymentStatusMetadata("en");
export default orderPaymentStatusPage("en");
