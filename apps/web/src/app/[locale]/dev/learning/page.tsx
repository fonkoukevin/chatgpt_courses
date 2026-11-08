import { LearningDemo } from "@/components/demos";
import { requireShowcase } from "@/lib/config/showcase";
export default async function LearningShowcase({ params }: { params: Promise<{ locale: string }> }) {
  return <LearningDemo locale={await requireShowcase(params)} />;
}
