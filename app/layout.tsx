import type { Metadata, Viewport } from "next";
import { Cinzel, EB_Garamond, Geist, Pinyon_Script } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Classical Roman capitals paired with a copperplate script, like an engraved invitation.
const display = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["400", "500", "600"] });
const script = Pinyon_Script({ variable: "--font-pinyon", subsets: ["latin"], weight: "400" });
// Body text on museum cards: Cinzel is capitals-only, so paragraphs use a classic book serif.
const serif = EB_Garamond({ variable: "--font-garamond", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "The Living Canvas",
  description: "An interactive museum where the people in great paintings speak.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0806",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${script.variable} ${serif.variable} antialiased`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
