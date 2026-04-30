"use client";

import * as RSelect from "@radix-ui/react-select";
import type { ReactNode } from "react";
import styles from "./select.module.scss";

interface Option {
  value: string;
  label: ReactNode;
}

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  ariaLabel?: string;
}

export function Select({ id, value, onChange, options, placeholder, ariaLabel }: Props) {
  return (
    <RSelect.Root value={value} onValueChange={onChange}>
      <RSelect.Trigger id={id} className={styles.trigger} aria-label={ariaLabel}>
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon className={styles.chevron} aria-hidden>
          ▾
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          className={styles.content}
          position="popper"
          sideOffset={4}
        >
          <RSelect.Viewport className={styles.viewport}>
            {options.map((opt) => (
              <RSelect.Item key={opt.value} value={opt.value} className={styles.item}>
                <RSelect.ItemText>{opt.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className={styles.indicator}>✓</RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
