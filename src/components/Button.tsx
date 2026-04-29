import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Spinner } from "./Spinner";
import styles from "./Button.module.scss";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid" | "text";
type Size = "md" | "sm";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps | "href"> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", loading = false, className, children } = props;

  const classes = cx(
    styles.btn,
    styles[`size_${size}`],
    styles[variant],
    className,
  );

  const content = (
    <>
      {loading && <Spinner size="sm" />}
      {children}
    </>
  );

  if ("href" in props && props.href !== undefined) {
    const { href, loading: _l, variant: _v, size: _s, className: _c, children: _ch, ...rest } = props;
    void _l; void _v; void _s; void _c; void _ch;
    return (
      <Link
        href={href}
        className={classes}
        aria-disabled={loading || undefined}
        {...rest}
      >
        {content}
      </Link>
    );
  }

  const { type = "button", disabled, loading: _l, variant: _v, size: _s, className: _c, children: _ch, ...rest } = props as ButtonAsButton;
  void _l; void _v; void _s; void _c; void _ch;
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {content}
    </button>
  );
}
