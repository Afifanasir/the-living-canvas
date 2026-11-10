// Subtitle timing. Each recording's real sentence starts are measured from the audio (scripts/cue-times.py →
// lib/cue-times.json); where a recording has none, the clip is shared out by sentence length.
import times from "./cue-times.json";

const PAD = 0.25; // silence at each end of every VO file

export const sentences = (line: string) => line.split(/(?<=[.!?])\s+/).filter(Boolean);

/** Index of the sentence being spoken at time t (seconds) of a clip lasting d seconds. `key` ("<slug>/<id>")
 *  picks the measured timings for that recording. */
export function cueAt(line: string, t: number, d: number, key?: string) {
  const measured = key ? (times as Record<string, number[]>)[key] : undefined;
  if (measured) return measured.filter((start) => t >= start).length;
  const parts = sentences(line);
  const total = parts.reduce((n, s) => n + s.length, 0);
  const at = ((t - PAD) / Math.max(d - 2 * PAD, 0.001)) * total;
  let acc = 0;
  for (let i = 0; i < parts.length; i++) {
    acc += parts[i].length;
    if (at < acc) return i;
  }
  return parts.length - 1;
}
