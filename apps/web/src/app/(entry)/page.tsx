import { redirect } from "next/navigation";
import { getServerConfig } from "@/lib/config/server";

export const dynamic = "force-dynamic";

export default function EntryPage() {
  redirect(`/${getServerConfig().defaultLocale}`);
}
