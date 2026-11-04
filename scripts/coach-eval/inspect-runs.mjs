// Read-only: prints replies and plan writes from the saved comparison runs.
//   node scripts/coach-eval/inspect-runs.mjs show <run key> [<run key> ...]
//   node scripts/coach-eval/inspect-runs.mjs plan <run key> [<run key> ...]
//   node scripts/coach-eval/inspect-runs.mjs checks
import fs from "node:fs";
import path from "node:path";

const RUNS = path.resolve("scripts/coach-eval/out/runs");
const load = (key) => JSON.parse(fs.readFileSync(path.join(RUNS, `${key}.json`), "utf8"));
const all = () => fs.readdirSync(RUNS).map((f) => JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8")));

function show(key) {
  const r = load(key);
  console.log(`\n===== ${key} | $${r.cost.toFixed(3)} | output tokens ${r.usage.output_tokens} | api calls ${r.apiCalls}`);
  for (const t of r.transcript) {
    if (t.human || t.fixed) continue;
    if (t.text) console.log(`COACH: ${t.text}`);
    else if (t.tool === "update_workouts") {
      const ops = (t.input.operations ?? []).map((o) => `${o.date} ${o.op} ${o.workout?.type ?? ""}: ${(o.workout?.notes ?? "").slice(0, 110)}`);
      console.log(`[WRITE] ${ops.join(" || ")}`);
    } else if (t.tool) console.log(`[tool] ${t.tool}`);
    else if (t.note) console.log(`[note] ${t.note}`);
  }
}

function plan(key) {
  const r = load(key);
  const writes = r.transcript.filter((t) => t.tool === "update_workouts").length;
  console.log(`\n===== ${key} | $${r.cost.toFixed(3)} | output ${r.usage.output_tokens} | api calls ${r.apiCalls} | week writes ${writes} | workouts ${r.finalPlan?.length}`);
  for (const t of r.transcript) if (t.text) console.log(`COACH: ${t.text.slice(0, 900)}`);
  console.log("--- quality sessions");
  for (const w of (r.finalPlan ?? []).filter((w) => !["easy", "recovery", "rest"].includes(w.type))) {
    console.log(`${w.date} ${w.day} ${w.type}: ${w.notes.slice(0, 95)}`);
  }
}

function checks() {
  console.log("--- says it changed the plan, but no update_workouts call");
  const claim = /(I['’]ve|I have) (made|updated|changed|swapped|moved|written)|has been updated/i;
  for (const r of all()) {
    if (r.tools.update_workouts) continue;
    const text = r.transcript.filter((t) => t.text && !t.fixed).map((t) => t.text).join(" ");
    const m = text.match(new RegExp(`.{0,70}(?:${claim.source}).{0,70}`, "i"));
    if (m) console.log(`${r.key} | ${m[0]}`);
  }
  console.log("\n--- wrote to the plan when the athlete didn't ask for or agree to a change");
  const noWrite = ["s1-", "s4-", "s6a", "s6b", "s7-", "s8-", "s10", "s12", "s13"];
  const counts = {};
  for (const r of all()) {
    if (!noWrite.some((p) => r.scenario.startsWith(p))) continue;
    const c = (counts[r.arm] ??= { runs: 0, wrote: 0, keys: [] });
    c.runs++;
    if (r.tools.update_workouts) {
      c.wrote++;
      c.keys.push(`${r.scenario}/r${r.rep}`);
    }
  }
  console.log(JSON.stringify(counts, null, 1));
}

const [mode, ...keys] = process.argv.slice(2);
if (mode === "show") keys.forEach(show);
else if (mode === "plan") keys.forEach(plan);
else checks();
