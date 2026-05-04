"use client";
import React, { useState, useMemo, type FormEvent } from "react";
import { DayPicker } from "react-day-picker";
import { Button } from "@/components/button/button";
import { Card } from "@/components/card/card";
import { Input } from "@/components/input/input";
import { Textarea } from "@/components/textarea/textarea";
import { Spinner } from "@/components/spinner/spinner";
import styles from "./build-form-card.module.scss";
import type { BuildFormInput } from "@/lib/build-form";

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

// ── Toggle pill group ────────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | "";
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.toggleGroup}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`${styles.togglePill} ${value === opt.value ? styles.togglePillActive : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Date picker ──────────────────────────────────────────────────────────────

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const CAL_CLASSES = {
  root: styles.calGrid,
  month_grid: styles.calTable,
  weekdays: styles.calWeekdays,
  weekday: styles.calWeekday,
  week: styles.calWeek,
  day: styles.calDay,
  day_button: styles.calDayBtn,
  selected: styles.calSelected,
  today: styles.calToday,
  outside: styles.calOutside,
  disabled: styles.calDisabled,
};

// eslint-disable-next-line react/display-name
const NULL_COMPONENTS = {
  MonthCaption: (): React.JSX.Element => <></>,
  Nav: (): React.JSX.Element => <></>,
};

function DatePickerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const base = value ? parseLocalDate(value) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const selected = value ? parseLocalDate(value) : undefined;

  const monthLabel = useMemo(
    () => month.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [month]
  );

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    onChange(toIso(date));
    setOpen(false);
  }

  return (
    <div className={styles.dateField}>
      <button
        type="button"
        className={`${styles.dateTrigger} ${!value ? styles.datePlaceholder : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {value ? formatDisplay(value) : "Select a date"}
      </button>
      {open && (
        <div className={styles.cal}>
          <div className={styles.calCaption}>
            <button
              type="button"
              className={styles.calNavBtn}
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className={styles.calMonthLabel}>{monthLabel}</span>
            <button
              type="button"
              className={styles.calNavBtn}
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <DayPicker
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={handleSelect}
            disabled={{ before: new Date() }}
            components={NULL_COMPONENTS}
            classNames={CAL_CLASSES}
          />
        </div>
      )}
    </div>
  );
}

// ── Editable form ────────────────────────────────────────────────────────────

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
    if (goalType === "race" && (!raceDate.trim() || !raceEvent.trim())) return;
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

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Sport</span>
        <ToggleGroup
          options={[
            { value: "run" as const, label: "Run" },
            { value: "bike" as const, label: "Bike" },
          ]}
          value={sport}
          onChange={setSport}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Goal type</span>
        <ToggleGroup
          options={[
            { value: "race" as const, label: "Race-targeted" },
            { value: "indefinite" as const, label: "Indefinite build" },
          ]}
          value={goalType}
          onChange={setGoalType}
        />
      </div>

      {goalType === "race" && (
        <div className={styles.raceFields}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="raceDate">
              Race date
            </label>
            <DatePickerField value={raceDate} onChange={setRaceDate} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="raceEvent">
              Race / event
            </label>
            <Input
              id="raceEvent"
              type="text"
              value={raceEvent}
              onChange={(e) => setRaceEvent(e.target.value)}
              placeholder="Boston Marathon"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="targetTime">
              Target time
            </label>
            <Input
              id="targetTime"
              type="text"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              placeholder="sub-3:00"
            />
          </div>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="context">
          Goals &amp; context
        </label>
        <Textarea
          id="context"
          rows={3}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Anything else worth knowing — weekly mileage preferences, race terrain, doubles, days you can't train, prior PBs etc."
        />
      </div>

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

// ── Locked / submitting view ─────────────────────────────────────────────────

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
            {values.race_date ? `, ${formatDisplay(values.race_date)}` : null}
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
