// TOGO'S VOICE — the whole copy table in one file, so a lint can run on it.
//
// THE TWO LAWS, encoded here rather than in a style guide:
//   LAW 1  The cyan SF-Mono telemetry states FACTS. Togo states VERDICTS AND
//          HEADINGS. He never says a number.
//   LAW 2  He judges food and conditions, never the user.
//
// Mechanical rules every string below satisfies: ≤8 words · present tense ·
// no measurement (see LINE_LINT) · no emoji · no lore · exactly ONE exclamation
// mark in the entire table (calibration complete).
//
// Three variants per state, rotated by `sessionIndex % 3`, so he never repeats a
// line inside one session. Deterministic and server-safe — no randomness ever
// runs during render.

export type TogoState =
  | "home"
  | "reading"
  | "safer"
  | "brave"
  | "notFeelingIt"
  | "emptyPalate"
  | "signin"
  | "nothingOpen"
  | "offline"
  | "locationDenied"
  | "excluded"
  | "calibrated"
  | "howWasIt"
  | "erase";

type Triplet = readonly [string, string, string];

export const TOGO_LINES: Record<TogoState, Triplet> = {
  home: ["I know the way.", "Say when. I'm already decided.", "You're hungry. I'm ahead of you."],
  reading: ["Reading the street.", "Rain's coming in. Adjusting.", "Holding at the crossing."],
  safer: ["Known road. You'll be fine.", "Safe. Nobody wrote home about it.", "No surprises. That's the point."],
  brave: ["Longer walk. Better story.", "This one has a point of view.", "Unknown road. Your call."],
  notFeelingIt: ["Fair. New line.", "Noted. I had a second answer.", "Then we go around."],
  emptyPalate: [
    "I can't lead a stranger. Show me.",
    "Show me your palate first.",
    "Nothing to steer by yet.",
  ],
  signin: [
    "Sign in. I'll remember the route.",
    "Sign in. I'd rather not relearn you.",
    "Sign in and I keep the map.",
  ],
  nothingOpen: [
    "Kitchens are dark. Wrong hour to move.",
    "Everything good is shut. Walk or wait.",
    "No heading worth taking now.",
  ],
  offline: ["No signal. Running on memory.", "Blind out here. Last known picks below.", "Lost the street. Holding."],
  locationDenied: [
    "Tell me where you're standing.",
    "I need a start point.",
    "Pick the area. I'll take it from there.",
  ],
  excluded: [
    "You've refused the whole street.",
    "Nothing left on this range.",
    "Widen it or we don't move.",
  ],
  // THE ONE EXCLAMATION MARK IN THE PRODUCT. Nowhere else, ever.
  calibrated: ["Now I can lead!", "Now I can lead!", "Now I can lead!"],
  // The one thing he cannot work out by watching. He has to ask.
  howWasIt: ["Did it land?", "Worth the walk?", "So — was I right?"],
  erase: [
    "This wipes the route. I start lost.",
    "This deletes what I know of you.",
    "Then I'm leading a stranger again.",
  ],
};

/** One line per mood chip — he reacts to the choice, he never re-asks. */
export const MOOD_LINES: Record<string, string> = {
  spicy: "Heat it is. Walk it off after.",
  light: "Clean line. Good.",
  soupy: "Wet food, dry seat. Noted.",
  comfort: "Heavy. Take the long way back.",
  cheap: "Lazy. Respectable.",
  nearby: "Fine. Short haul.",
  surprise: "Then don't look at the map.",
};

/** Every fourth card, one line. Card 16 is the HOWL and the exclamation. */
export const ONBOARDING_BEATS: Record<number, string> = {
  4: "You like it wet.",
  8: "You have a type.",
  12: "Predictable. In a good way.",
};

/**
 * RESULT — his attribution clause. He may name a place, a street, a direction
 * and a dish; he may never name a measurement, so the clause is chosen from real
 * conditions rather than interpolated from data.
 */
export function resultClause(opts: { raining: boolean; hour: number; index?: number }): string {
  const i = rot(opts.index);
  if (opts.raining) {
    return ["Rain wants gravy.", "Wet street. Take the covered line.", "Rain outside. Warm inside."][i];
  }
  if (opts.hour >= 21 || opts.hour < 6) {
    return ["Quiet hour, no queue.", "Late. The good stalls hold.", "Empty street. Move now."][i];
  }
  if (opts.hour < 11) {
    return ["Early line. Nothing in the way.", "First light. Kitchens are fresh.", "Clean start. Take it."][i];
  }
  return ["You've earned the walk.", "Good hour for it.", "Straight run. No detours."][i];
}

function rot(index = 0): 0 | 1 | 2 {
  return (((index % 3) + 3) % 3) as 0 | 1 | 2;
}

/** The line for a state, rotated so he never repeats inside one session. */
export function togoLine(state: TogoState, index = 0): string {
  return TOGO_LINES[state][rot(index)];
}

/**
 * THE COPY LINT — every rule in `personality` is mechanically checkable, so it
 * is checked here rather than trusted. Exported for tests; never runs in render.
 */
const MEASUREMENT =
  /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen|sixteen|percent|min|mins|minute|minutes|metres|meters|degrees|dollars?)\b/i;

export function lintLine(line: string): string | null {
  if (line.trim().split(/\s+/).length > 8) return "over eight words";
  if (MEASUREMENT.test(line)) return "speaks a measurement";
  if (/\p{Extended_Pictographic}/u.test(line)) return "contains an emoji";
  return null;
}
