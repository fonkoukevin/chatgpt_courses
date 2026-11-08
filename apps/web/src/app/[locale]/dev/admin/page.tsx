import { AdminDemo } from "@/components/demos";
import { requireShowcase } from "@/lib/config/showcase";
export default async function AdminShowcase({ params }: { params: Promise<{ locale: string }> }) {
  return <AdminDemo locale={await requireShowcase(params)} />;
}
