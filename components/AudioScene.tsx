"use client";

import { useEffect } from "react";
import { setScene } from "@/lib/audio";

// The homepage and the whole gallery: one track, Moby's "LA1", from the first page through every wing.
export const GALLERY = "/audio/music/gallery-foyer.mp3";

/** Declares what should be playing on this page; the engine crossfades to it. */
export default function AudioScene({ music, ambience, fade }: { music?: string; ambience?: string; fade?: number }) {
  useEffect(() => setScene({ music, ambience, fade }), [music, ambience, fade]);
  return null;
}
