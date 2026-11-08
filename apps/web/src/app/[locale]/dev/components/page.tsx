import { ComponentGallery } from "@/components/component-gallery";
import { requireShowcase } from "@/lib/config/showcase";
export default async function ComponentsShowcase({ params }: { params: Promise<{ locale: string }> }) {
  return <ComponentGallery locale={await requireShowcase(params)} />;
}
