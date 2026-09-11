// A small, self-contained nudge for the dashboard header.
//
// No external quotes API: that would add a network dependency and copyright
// ambiguity for one line of flavour text. These lines are original, rotate
// deterministically by day (so the page is stable within a day and doesn't
// flicker on re-render), and give way to state-aware messages when the
// pipeline is telling a more specific story.

type Counts = {
  total: number;
  neu: number; // "New" — awaiting review
  applied: number;
  offers: number;
};

const DAILY = [
  "Every application is a rep. Keep showing up.",
  "The right role is a numbers game — and momentum compounds.",
  "Progress over perfection. One good match beats ten frantic ones.",
  "You only need one yes. Keep putting yourself in front of it.",
  "Small, steady steps get you further than a single big push.",
  "Rejections are routing, not verdicts. Keep going.",
  "Today's effort is tomorrow's interview. Stay with it.",
];

/** Deterministic day index so the message is stable across a day's renders. */
function dayIndex(now = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000);
}

export function encouragement(c: Counts, now = new Date()): string {
  if (c.total === 0) {
    return "Your search starts here. Run one below and the pipeline fills in.";
  }
  if (c.offers > 0) {
    return c.offers === 1
      ? "An offer on the board. That's the whole game — nicely done."
      : `${c.offers} offers in play. You've earned the choice.`;
  }
  if (c.applied > 0 && c.neu === 0) {
    return "Everything's out the door. Now the follow-through — keep the pressure on.";
  }
  if (c.neu >= 5) {
    return `${c.neu} fresh matches waiting. Triage a few today — future you will thank you.`;
  }
  return DAILY[dayIndex(now) % DAILY.length];
}
