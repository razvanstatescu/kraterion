import type { ReactNode } from "react";

interface Props {
  label: string;
  htmlFor?: string;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, htmlFor, helper, error, required, children }: Props) {
  return (
    <div className="ks-field">
      <label className="ks-field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ks-field-req">*</span> : null}
      </label>
      {children}
      {error ? <div className="ks-field-error">{error}</div>
        : helper ? <div className="ks-field-helper">{helper}</div> : null}
    </div>
  );
}
