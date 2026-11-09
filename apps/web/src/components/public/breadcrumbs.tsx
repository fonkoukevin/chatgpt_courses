import { Link } from "@/components/ui";

export type BreadcrumbTrail = { label: string; items: { label: string; href: string }[]; structured: boolean };

export function PublicBreadcrumbs({ trail }: { trail?: BreadcrumbTrail }) {
  if (!trail || trail.items.length < 2) return null;
  const data = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: trail.items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.label, item: item.href })) };
  return <>
    <nav aria-label={trail.label}><ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">{trail.items.map((item, index) => <li key={item.href} className="flex min-w-0 items-center gap-2">{index > 0 && <span aria-hidden="true">/</span>}{index === trail.items.length - 1 ? <span aria-current="page" className="break-words">{item.label}</span> : <Link href={item.href} className="inline-flex min-h-11 items-center">{item.label}</Link>}</li>)}</ol></nav>
    {trail.structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replaceAll("<", "\\u003c") }} />}
  </>;
}
