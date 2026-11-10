import { Suspense } from "react";
import { notFound } from "next/navigation";
import ExhibitRoom from "@/components/ExhibitRoom";
import { exhibits } from "@/content/gallery";

export function generateStaticParams() {
  return exhibits.map((e) => ({ slug: e.slug }));
}

async function Room({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = exhibits.findIndex((e) => e.slug === slug);
  if (i < 0) notFound();
  const n = exhibits.length;
  return <ExhibitRoom exhibit={exhibits[i]} prev={exhibits[(i - 1 + n) % n].slug} next={exhibits[(i + 1) % n].slug} />;
}

// Params stay behind Suspense so navigation between rooms is instant (Next 16 partial prefetching).
export default function Page(props: PageProps<"/exhibit/[slug]">) {
  return (
    <Suspense fallback={<main className="screen" />}>
      <Room params={props.params} />
    </Suspense>
  );
}
