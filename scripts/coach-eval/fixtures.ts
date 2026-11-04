/* eslint-disable */
// @ts-nocheck
// Synthetic athletes for the coach comparison. No real athlete data.

export const TODAY = "2026-11-04"; // A Wednesday.

const MI = 1609.344;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayName(iso) {
  return DAY_NAMES[new Date(`${iso}T12:00:00Z`).getUTCDay()];
}

function workout(date, type, mi, notes = "", secondary = null) {
  return {
    id: `w-${date}`,
    plan_id: "plan",
    date,
    type,
    distance_meters: mi != null ? String(Math.round(mi * MI)) : null,
    duration_seconds: null,
    notes,
    secondary,
  };
}

function buildWorkouts(start, end, pattern, overrides) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const o = overrides[d] ?? pattern[dayName(d)];
    if (!o) continue;
    out.push(workout(d, o[0], o[1], o[2] ?? ""));
  }
  return out;
}

// Laps: warm-up, reps, cool-down. reps = [[meters, seconds, hr], ...]
function laps(id, wuMi, reps, cdMi, easyPacePerKm = 267) {
  const lap = (i, m, s, hr) => ({
    id: `${id}-lap-${i}`,
    activity_id: id,
    lap_index: i,
    distance_meters: m,
    moving_time_seconds: s,
    avg_pace_seconds_per_km: Math.round((s / m) * 1000 * 10) / 10,
    avg_hr: hr,
  });
  const out = [lap(1, wuMi * MI, Math.round(wuMi * MI * (easyPacePerKm / 1000)), 135)];
  reps.forEach((r, i) => out.push(lap(i + 2, r[0], r[1], r[2])));
  out.push(lap(reps.length + 2, cdMi * MI, Math.round(cdMi * MI * (easyPacePerKm / 1000)), 140));
  return out;
}

function activity(date, type, mi, pacePerKm, hr, name, lapList = []) {
  const distance = mi * MI;
  return {
    id: `act-${date}`,
    start_date: `${date}T12:00:00.000Z`,
    name,
    type,
    distance_meters: Math.round(distance),
    moving_time_seconds: pacePerKm ? Math.round((distance / 1000) * pacePerKm) : Math.round((mi / 18) * 3600),
    avg_hr: hr,
    avg_pace_seconds_per_km: pacePerKm,
    avg_power_watts: null,
    matched_workout_id: null,
    _laps: lapList,
  };
}

// Actuals: every past planned session done roughly as written.
function activitiesFromPlan(workouts, opts) {
  const out = [];
  for (const w of workouts) {
    if (w.date >= TODAY || w.type === "rest") continue;
    const mi = Number(w.distance_meters ?? 0) / MI;
    if (opts.hard?.[w.date]) {
      const h = opts.hard[w.date];
      out.push(activity(w.date, "Run", mi, h.pace, h.hr, h.name, laps(`act-${w.date}`, h.wu, h.reps, h.cd, opts.easyPace)));
    } else if (w.type === "long") {
      out.push(activity(w.date, "Run", mi, opts.longPace, opts.longHr, "Long Run"));
    } else if (["tempo", "threshold", "intervals", "race"].includes(w.type)) {
      // Quality sessions without detailed laps still show as quality in the log.
      out.push(activity(w.date, "Run", mi, opts.workoutPace ?? opts.longPace - 25, (opts.longHr ?? 145) + 10, "Workout"));
    } else {
      out.push(activity(w.date, "Run", mi, opts.easyPace, opts.easyHr, "Easy Run"));
    }
  }
  return out;
}

function rollup(miles, count, secPerMile = 450) {
  const m = miles * MI;
  const t = miles * secPerMile;
  return {
    count,
    total_distance_meters: Math.round(m),
    total_moving_time_seconds: Math.round(t),
    by_type: { Run: { count, distance_meters: Math.round(m), moving_time_seconds: Math.round(t) } },
  };
}

const repsOf = (n, m, base, step, hr) =>
  Array.from({ length: n }, (_, i) => [m, base - i * step, hr + i]);

// A: half marathon build, experienced, stuck in a rep-repeat mold.
function athleteA() {
  const workouts = buildWorkouts(
    "2026-10-12",
    "2026-12-06",
    {
      Mon: ["easy", 7],
      Tue: ["easy", 9],
      Wed: ["easy", 8],
      Thu: ["easy", 7],
      Fri: ["easy", 8],
      Sat: ["easy", 6],
      Sun: ["long", 15],
    },
    {
      "2026-10-14": ["threshold", 11, "4 × 1 mile @ 5:45–5:50/mi (≈ 5:48 per rep), 90 sec jog. 3 mi warm-up and cool-down. Intent: threshold, current pace."],
      "2026-10-21": ["threshold", 12, "5 × 1 mile @ 5:40–5:45/mi (≈ 5:42 per rep), 90 sec jog. 3 mi warm-up and cool-down. Intent: threshold, gliding toward HMP."],
      "2026-10-25": ["long", 16],
      "2026-10-28": ["intervals", 12, "8 × 1 km @ 3:28–3:32/km (≈ 3:30 per rep), 90 sec jog. 3 mi warm-up and cool-down. Intent: VO2max."],
      "2026-11-01": ["intervals", 13, "4 × 1 mile @ 5:35–5:40/mi, 90 sec jog, then 8 × 400 m @ 72–75 s, 60 sec jog. 2 mi warm-up and cool-down. Intent: threshold and speed."],
      "2026-11-04": ["threshold", 13, "6 × 1 mile @ 5:30–5:35/mi (≈ 5:33 per rep), 60 sec jog. 3 mi warm-up and cool-down. Intent: threshold, gliding toward HMP."],
      "2026-11-06": ["threshold", 11, "8 × 1 km @ 3:26–3:30/km (≈ 3:28 per rep), 60 sec jog. 2 mi warm-up and cool-down. Intent: threshold."],
      "2026-11-07": ["cross", 100, "Charity century ride, steady moderate effort."],
      "2026-11-08": ["recovery", 5],
      "2026-11-11": ["threshold", 13, "7 × 1 mile @ 5:30/mi (≈ 5:30 per rep), 60 sec jog. 3 mi warm-up and cool-down. Intent: threshold."],
      "2026-11-14": ["intervals", 13, "10 × 1 km @ 3:20–3:24/km (≈ 3:22 per rep), 90 sec jog. 2 mi warm-up and cool-down. Intent: VO2max."],
      "2026-11-15": ["long", 16],
      "2026-11-18": ["threshold", 13, "8 × 1 mile @ 5:28/mi, 60 sec jog. 2 mi warm-up and cool-down. Intent: threshold."],
      "2026-11-21": ["intervals", 12, "6 × 1 mile @ 5:20/mi, 2 min jog. 2 mi warm-up and cool-down. Intent: VO2max."],
      "2026-11-22": ["long", 14],
      "2026-11-25": ["threshold", 9, "4 × 1 mile @ 5:40/mi, 90 sec jog. Intent: taper sharpening."],
      "2026-11-29": ["long", 10],
      "2026-12-02": ["threshold", 7, "3 × 1 mile @ 5:40/mi, 90 sec jog. Intent: race week openers."],
      "2026-12-03": ["easy", 5],
      "2026-12-04": ["easy", 4],
      "2026-12-05": ["easy", 3],
      "2026-12-06": ["race", 13.1, "Goal race: half marathon, target 1:15:00 (5:43/mi)."],
    }
  );
  const activities = activitiesFromPlan(workouts, {
    easyPace: 267,
    easyHr: 138,
    longPace: 258,
    longHr: 145,
    hard: {
      "2026-10-14": { pace: 240, hr: 152, name: "Threshold Miles", wu: 3, cd: 3, reps: repsOf(4, MI, 349, 1, 163) },
      "2026-10-21": { pace: 238, hr: 154, name: "Threshold Miles", wu: 3, cd: 3, reps: repsOf(5, MI, 344, 1, 164) },
      "2026-10-28": { pace: 236, hr: 155, name: "1k Repeats", wu: 3, cd: 3, reps: repsOf(8, 1000, 211, 0.5, 168) },
      "2026-11-01": {
        pace: 232,
        hr: 157,
        name: "Miles + 400s",
        wu: 2,
        cd: 2,
        reps: [...repsOf(4, MI, 338, 1, 165), ...repsOf(8, 400, 74, 0.7, 172)],
      },
    },
  });
  return {
    units: "mi",
    plan: {
      id: "plan-a",
      title: "Sub-1:15 Half Marathon",
      sport: "run",
      mode: "goal",
      goal: { race_distance: "Half Marathon", race_date: "2026-12-06", target_time: "1:15:00" },
      start_date: "2026-09-28",
      end_date: "2026-12-06",
      is_active: true,
      coach_notes:
        "Goal: half marathon on 12/6, target 1:15:00. Weeks 1–3 base, 4–9 threshold and VO2 build, 10 taper.",
      generation_status: "complete",
    },
    coachNotes: "Runs 55–60 mi/week at peak. Half PB 1:17:40 last spring. Charity century ride on Sat 11/7 is a fixed commitment.",
    workouts,
    activities,
    rollups: { four_week: rollup(230, 26), twelve_week: rollup(620, 76), fifty_two_week: rollup(2300, 300) },
  };
}

// B: 5K build with a deliberately repeated benchmark session.
function athleteB() {
  const workouts = buildWorkouts(
    "2026-10-05",
    "2026-11-28",
    {
      Mon: ["easy", 6],
      Tue: ["easy", 7],
      Wed: ["easy", 6],
      Thu: ["easy", 5],
      Fri: ["easy", 6],
      Sat: ["easy", 5],
      Sun: ["long", 12],
    },
    {
      "2026-10-14": ["intervals", 9, "Benchmark: 6 × 1 km @ 3:35–3:40/km (≈ 3:38 per rep), 2 min jog. 2 mi warm-up and cool-down. Intent: benchmark to measure VO2max progress; repeats on 11/06."],
      "2026-10-20": ["intervals", 8, "6 × 90 sec hill at hard effort, jog down. 2 mi warm-up and cool-down. Intent: strength and economy."],
      "2026-10-23": ["threshold", 8, "4 × 8 min @ 3:50/km, 90 sec float. 2 mi warm-up and cool-down. Intent: critical velocity."],
      "2026-10-27": ["intervals", 9, "3 × 2 km @ 3:42/km (≈ 7:24 per rep), 3 min jog. 2 mi warm-up and cool-down. Intent: VO2max, longer reps."],
      "2026-10-30": ["intervals", 7, "10 × 200 m @ 36 s, 200 m jog. 2 mi warm-up and cool-down. Intent: speed."],
      "2026-11-03": ["threshold", 8, "20 min continuous @ 3:52/km. 2 mi warm-up and cool-down. Intent: threshold."],
      "2026-11-06": ["intervals", 9, "Benchmark repeat of 10/14: 6 × 1 km, same 2 min jog, aiming for 3:30–3:35/km (≈ 3:32 per rep). Intent: measure change and set final-block paces."],
      "2026-11-10": ["intervals", 8, "5 × 1 km @ goal 3:30/km, 2 min jog. Intent: race-pace specificity."],
      "2026-11-14": ["race", 3.1, "Tune-up 5K."],
      "2026-11-20": ["intervals", 7, "6 × 600 m @ 3:25/km, 90 sec jog. Intent: sharpening."],
      "2026-11-25": ["intervals", 5, "4 × 400 m @ goal pace, 90 sec jog. Intent: openers."],
      "2026-11-28": ["race", 3.1, "Goal race: 5K, target 17:30."],
    }
  );
  const activities = activitiesFromPlan(workouts, {
    easyPace: 285,
    easyHr: 136,
    longPace: 275,
    longHr: 142,
    hard: {
      "2026-10-14": { pace: 250, hr: 152, name: "Benchmark 1ks", wu: 2, cd: 2, reps: repsOf(6, 1000, 219, 0.4, 169) },
      "2026-10-27": { pace: 248, hr: 154, name: "2k Repeats", wu: 2, cd: 2, reps: repsOf(3, 2000, 446, 1, 170) },
      "2026-11-03": { pace: 252, hr: 153, name: "Threshold 20", wu: 2, cd: 2, reps: [[5160, 1200, 166]] },
    },
  });
  return {
    units: "mi",
    plan: {
      id: "plan-b",
      title: "Sub-17:30 5K",
      sport: "run",
      mode: "goal",
      goal: { race_distance: "5K", race_date: "2026-11-28", target_time: "17:30" },
      start_date: "2026-09-28",
      end_date: "2026-11-28",
      is_active: true,
      coach_notes: "Goal: 5K on 11/28, target 17:30. The 6 × 1 km benchmark on 10/14 and 11/06 sets final-block paces.",
      generation_status: "complete",
    },
    coachNotes: "Runs about 40 mi/week. 5K PB 18:05.",
    workouts,
    activities,
    rollups: { four_week: rollup(160, 26), twelve_week: rollup(460, 74), fifty_two_week: rollup(1700, 280) },
  };
}

// C: newer runner on low volume.
function athleteC() {
  const workouts = buildWorkouts(
    "2026-10-05",
    "2026-12-13",
    {
      Tue: ["easy", 3],
      Thu: ["tempo", 4, "1 mi warm-up, 15 min steady @ 9:30/mi, 1 mi cool-down. Intent: comfortably hard running."],
      Sat: ["easy", 3],
      Sun: ["long", 5],
    },
    {
      "2026-12-13": ["race", 6.2, "Goal race: first 10K."],
    }
  );
  const activities = activitiesFromPlan(workouts, { easyPace: 400, easyHr: 150, longPace: 405, longHr: 152 });
  return {
    units: "mi",
    plan: {
      id: "plan-c",
      title: "First 10K",
      sport: "run",
      mode: "goal",
      goal: { race_distance: "10K", race_date: "2026-12-13", target_time: "" },
      start_date: "2026-10-05",
      end_date: "2026-12-13",
      is_active: true,
      coach_notes: "First 10K. Started running about 6 months ago.",
      generation_status: "complete",
    },
    coachNotes: "",
    workouts,
    activities,
    rollups: { four_week: rollup(60, 16, 640), twelve_week: rollup(165, 46, 640), fifty_two_week: rollup(300, 88, 650) },
  };
}

function coldStub(id, title, race, date, target) {
  return {
    id,
    title,
    sport: "run",
    mode: "goal",
    goal: { race_distance: race, race_date: date, target_time: target },
    start_date: TODAY,
    end_date: date,
    is_active: false,
    coach_notes: "",
    generation_status: "generating",
  };
}

// D: steady athlete, cold-start half marathon build.
function athleteD() {
  const activities = [];
  for (let i = 21; i >= 1; i--) {
    const d = addDays(TODAY, -i);
    const day = dayName(d);
    if (day === "Mon") continue;
    if (day === "Thu") {
      const id = `act-${d}`;
      activities.push(activity(d, "Run", 9, 255, 155, "Workout", laps(id, 2, repsOf(5, MI, 365, 1, 165), 2, 285)));
    } else if (day === "Sun") {
      activities.push(activity(d, "Run", 13, 282, 142, "Long Run"));
    } else {
      activities.push(activity(d, "Run", 6, 288, 136, "Easy Run"));
    }
  }
  return {
    units: "mi",
    plan: coldStub("plan-d", "Half Marathon", "Half Marathon", "2027-02-07", "1:22:00"),
    coachNotes: "",
    workouts: [],
    activities,
    rollups: { four_week: rollup(180, 24, 460), twelve_week: rollup(530, 72, 460), fifty_two_week: rollup(2000, 280, 460) },
    otherPlans: [],
  };
}

// E: form says 60 mpw, Strava shows a recent low.
function athleteE() {
  const activities = [];
  for (let i = 21; i >= 1; i -= 2) {
    const d = addDays(TODAY, -i);
    activities.push(activity(d, "Run", 3.5, 300, 140, "Easy Run"));
  }
  return {
    units: "mi",
    plan: coldStub("plan-e", "Marathon", "Marathon", "2027-04-18", "2:45:00"),
    coachNotes: "",
    workouts: [],
    activities,
    rollups: { four_week: rollup(60, 16, 480), twelve_week: rollup(110, 30, 480), fifty_two_week: rollup(2400, 290, 440) },
    otherPlans: [],
  };
}

// F: cyclist stuck on the same threshold session, targeting a spring gran fondo.
function athleteF() {
  const threshold = "4 × 8 min @ 245–255 W, 4 min easy spin. 20 min warm-up, 15 min cool-down. Intent: threshold power.";
  const workouts = buildWorkouts(
    "2026-10-05",
    "2027-03-14",
    {
      Mon: ["rest", null],
      Tue: ["easy", 25],
      Wed: ["recovery", 18],
      Thu: ["threshold", 32, threshold],
      Fri: ["rest", null],
      Sat: ["long", 60],
      Sun: ["easy", 30],
    },
    { "2027-03-14": ["race", 90, "Goal event: spring gran fondo, 90 mi with 7,000 ft of climbing."] }
  );
  const activities = workouts
    .filter((w) => w.date < TODAY && w.type !== "rest")
    .map((w) => {
      const a = activity(w.date, "Ride", Number(w.distance_meters) / MI, null, w.type === "threshold" ? 152 : 128, w.type === "threshold" ? "Threshold Ride" : "Endurance Ride");
      if (w.type === "threshold") {
        a.avg_power_watts = 205;
        a._laps = Array.from({ length: 4 }, (_, i) => ({
          id: `${a.id}-lap-${i + 1}`,
          activity_id: a.id,
          lap_index: i + 1,
          distance_meters: 5200,
          moving_time_seconds: 480,
          avg_power_watts: 248 + (i === 3 ? 2 : 0),
          avg_hr: 158 + i,
        }));
      } else {
        a.avg_power_watts = 160;
      }
      return a;
    });
  return {
    units: "mi",
    plan: {
      id: "plan-f",
      title: "Spring Gran Fondo",
      sport: "bike",
      mode: "goal",
      goal: { race_distance: "Gran fondo", race_date: "2027-03-14", target_time: "" },
      start_date: "2026-10-05",
      end_date: "2027-03-14",
      is_active: true,
      coach_notes: "Goal: 90 mi gran fondo with 7,000 ft of climbing on 3/14. FTP about 260 W.",
      generation_status: "complete",
    },
    coachNotes: "Rides about 8–9 hours a week. Power meter on the road bike.",
    workouts,
    activities,
    rollups: { four_week: rollup(660, 20, 200), twelve_week: rollup(1900, 60, 200), fifty_two_week: rollup(7000, 220, 205) },
  };
}

export const FIXTURES = { A: athleteA, B: athleteB, C: athleteC, D: athleteD, E: athleteE, F: athleteF };
