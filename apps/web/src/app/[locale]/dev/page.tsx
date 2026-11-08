import { redirect } from "next/navigation";
import { requireShowcase } from "@/lib/config/showcase";

export default async function ShowcaseIndex({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await requireShowcase(params);
  redirect(`/${locale}/dev/components`);
}
