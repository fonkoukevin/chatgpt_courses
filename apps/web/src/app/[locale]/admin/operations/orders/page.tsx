import { operationsMetadata, operationsServerPage } from "@/components/operations/server-pages";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const generateMetadata = operationsMetadata;
export default operationsServerPage("orders", false);
