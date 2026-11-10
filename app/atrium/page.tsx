import Image from "next/image";
import Link from "next/link";
import AudioScene, { GALLERY } from "@/components/AudioScene";
import SoundToggle from "@/components/SoundToggle";
import { exhibits, periods } from "@/content/gallery";

export default function Atrium() {
  return (
    <main className="screen gap-[2.5dvh]">
      <AudioScene music={GALLERY} />
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.35em] text-gilt uppercase">The Atrium</p>
          <h1 className="mt-1 font-display text-[clamp(1.6rem,min(4vw,6dvh),3rem)] leading-tight">Walk through four centuries</h1>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link href="/#gallery" className="text-xs tracking-widest text-parchment/50 uppercase hover:text-parchment">
            Gallery
          </Link>
          <SoundToggle />
        </div>
      </header>

      {/* Phones and tablets: swipe between periods. Wide landscape screens: all four side by side. */}
      <ol className="-mx-[max(env(safe-area-inset-left),clamp(16px,3vw,48px))] flex min-h-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto px-[max(env(safe-area-inset-left),clamp(16px,3vw,48px))] [scrollbar-width:none] lg:landscape:mx-0 lg:landscape:grid lg:landscape:grid-cols-4 lg:landscape:overflow-visible lg:landscape:px-0">
        {periods.map((period, i) => (
          <li key={period.id} className="rise flex w-[82vw] shrink-0 snap-center flex-col sm:w-[44vw] lg:landscape:w-auto" style={{ animationDelay: `${i * 90}ms` }}>
            <div className="relative border-t border-gilt/30 pt-3">
              <span className="absolute -top-[5px] left-0 size-[9px] rounded-full bg-gilt shadow-[0_0_12px_var(--color-gilt)]" />
              <p className="text-[11px] tracking-[0.25em] text-parchment/45 tabular-nums">{period.years}</p>
              <h2 className="font-display text-[clamp(1.15rem,min(1.8vw,3.4dvh),1.6rem)] leading-tight">{period.name}</h2>
            </div>

            <div className="mt-[1.8dvh] grid min-h-0 flex-1 grid-rows-2 gap-3 squat:grid-cols-2 squat:grid-rows-1">
              {exhibits
                .filter((e) => e.period === period.id)
                .map((e) => (
                  <Link
                    key={e.slug}
                    href={`/exhibit/${e.slug}`}
                    className="group flex min-h-0 flex-col overflow-hidden rounded-sm bg-white/[0.03] ring-1 ring-white/10 transition hover:ring-gilt/60 focus-visible:outline-2 focus-visible:outline-gilt"
                  >
                    <div className="relative min-h-0 flex-1 transition duration-500 group-hover:scale-[1.03]">
                      <Image src={`/exhibits/${e.slug}/base.webp`} alt="" fill sizes="(min-width: 1024px) and (orientation: landscape) 25vw, 82vw" className="object-cover" />
                    </div>
                    <div className="shrink-0 px-3 py-2">
                      <p className="truncate font-display text-[clamp(1rem,min(1.4vw,2.6dvh),1.25rem)]">{e.artist}</p>
                      <p className="truncate text-xs text-parchment/50 italic">{e.title}</p>
                    </div>
                  </Link>
                ))}
            </div>
          </li>
        ))}
      </ol>

      <p className="text-center text-[11px] tracking-widest text-parchment/35 uppercase lg:landscape:hidden">Swipe through the periods</p>
    </main>
  );
}
