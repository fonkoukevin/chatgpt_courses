import { Suspense } from "react";
import { PublicHomePage, homeMetadata, type PublicPageProps } from "@/components/public/server-pages";
import { PublicLoading } from "@/components/public/route-states";

export { homeMetadata as generateMetadata };
export default function HomePage(props: PublicPageProps) {
  return <Suspense fallback={<PublicLoading />}><PublicHomePage {...props} /></Suspense>;
}
