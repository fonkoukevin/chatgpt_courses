import type { ReactNode } from "react";
import { RootDocument } from "@/components/root-document";
import { getServerConfig } from "@/lib/config/server";
import "../globals.css";

export default function EntryLayout({ children }: { children: ReactNode }) {
  return <RootDocument locale={getServerConfig().defaultLocale}>{children}</RootDocument>;
}
