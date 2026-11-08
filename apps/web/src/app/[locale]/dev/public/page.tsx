import { PublicDemo } from "@/components/demos";
import { requireShowcase } from "@/lib/config/showcase";
export default async function PublicShowcase({ params }: { params: Promise<{ locale: string }> }) {
  return <PublicDemo locale={await requireShowcase(params)} />;
}
