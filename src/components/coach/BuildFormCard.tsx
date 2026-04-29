"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Textarea } from "@/components/Textarea";
import { Spinner } from "@/components/Spinner";
import styles from "./BuildFormCard.module.scss";
import type { BuildFormInput } from "@/coach/buildForm";

export type BuildFormCardState =
  | { kind: "editable" }
  | { kind: "submitting"; values: BuildFormInput }
  | { kind: "locked"; values: BuildFormInput };

interface Props {
  state: BuildFormCardState;
  onSubmit: (values: BuildFormInput) => void;
  onCancel: () => void;
}

const SPORT_LABEL = { run: "Run", bike: "Bike" } as const;

export function BuildFormCard({ state, onSubmit, onCancel }: Props) {
  if (state.kind !== "editable") {
    return <LockedView values={state.values} showSpinner={state.kind === "submitting"} />;
  }
  return <EditableForm onSubmit={onSubmit} onCancel={onCancel} />;
}

function EditableForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (values: BuildFormInput) => void;
  onCancel: () => void;
}) {
  const [sport, setSport] = useState<"run" | "bike" | "">("");
  const [goalType, setGoalType] = useState<"race" | "indefinite" | "">("");
  const [raceDate, setRaceDate] = useState("");
  const [raceEvent, setRaceEvent] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [context, setContext] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sport || !goalType) return;
    if (goalType === "race") {
      if (!raceDate.trim() || !raceEvent.trim()) return;
    }
    onSubmit({
      sport,
      goal_type: goalType,
      race_date: goalType === "race" ? raceDate.trim() : undefined,
      race_event: goalType === "race" ? raceEvent.trim() : undefined,
      target_time: targetTime.trim() || undefined,
      context: context.trim() || undefined,
    });
  }

  return (
    <Card as="form" onSubmit={handleSubmit} aria-label="Build a plan" className={styles.wrap}>
      <h2 className={styles.heading}>Build a plan</h2>

      <fieldset className={styles.fieldset}>
        <legend>Sport</legend>
        <label>
          <input
            type="radio"
            name="sport"
            checked={sport === "run"}
            onChange={() => setSport("run")}
          />{" "}
          Run
        </label>
        <label>
          <input
            type="radio"
            name="sport"
            checked={sport === "bike"}
            onChange={() => setSport("bike")}
          />{" "}
          Bike
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Goal type</legend>
        <label>
          <input
            type="radio"
            name="goalType"
            checked={goalType === "race"}
            onChange={() => setGoalType("race")}
          />{" "}
          Race-targeted
        </label>
        <label>
          <input
            type="radio"
            name="goalType"
            checked={goalType === "indefinite"}
            onChange={() => setGoalType("indefinite")}
          />{" "}
          Indefinite build
        </label>
      </fieldset>

      {goalType === "race" && (
        <div className={styles.raceRow}>
          <label>
            Race date
            <Input
              type="date"
              value={raceDate}
              onChange={(e) => setRaceDate(e.target.value)}
              required
            />
          </label>
          <label>
            Race distance / event
            <Input
              type="text"
              value={raceEvent}
              onChange={(e) => setRaceEvent(e.target.value)}
              placeholder="Boston Marathon"
              required
            />
          </label>
          <label>
            Target time
            <Input
              type="text"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              placeholder="sub-3:00"
            />
          </label>
        </div>
      )}

      <label className={styles.contextLabel}>
        Goals &amp; context
        <Textarea
          rows={3}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Anything else worth knowing — race terrain, days you can't train, equipment, injuries, prior PBs, etc."
        />
      </label>

      <div className={styles.actions}>
        <Button type="submit" variant="primary">
          Build plan
        </Button>
        <Button type="button" variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function LockedView({ values, showSpinner }: { values: BuildFormInput; showSpinner: boolean }) {
  return (
    <Card aria-label="Plan request" className={styles.wrap}>
      <h2 className={styles.heading}>Plan request</h2>
      <ul className={styles.summary}>
        <li>
          <strong>Sport:</strong> {SPORT_LABEL[values.sport]}
        </li>
        {values.goal_type === "race" ? (
          <li>
            <strong>Goal:</strong> Race —{" "}
            {values.race_event ? <span>{values.race_event}</span> : null}
            {values.race_date ? `, ${values.race_date}` : null}
          </li>
        ) : (
          <li>
            <strong>Goal:</strong> Indefinite build
          </li>
        )}
        {values.target_time && (
          <li>
            <strong>Target time:</strong> {values.target_time}
          </li>
        )}
        {values.context && (
          <li>
            <strong>Goals &amp; context:</strong> {values.context}
          </li>
        )}
      </ul>
      {showSpinner && (
        <div className={styles.spinnerRow} role="status">
          <Spinner size="sm" style={{ color: "var(--color-brown)" }} /> Loading your training
          history…
        </div>
      )}
    </Card>
  );
}
