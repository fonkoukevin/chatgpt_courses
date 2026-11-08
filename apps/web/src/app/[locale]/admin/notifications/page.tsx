import { NotificationsServerPage, notificationsMetadata } from "@/components/notifications/server-page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const generateMetadata = notificationsMetadata;
export default NotificationsServerPage;
