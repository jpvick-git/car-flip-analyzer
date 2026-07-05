import React, { useEffect, useState } from "react";
import { formatCurrency, parseCurrencyInput } from "../utils/formatCurrency";

export default function CurrencyInput({
  value,
  onChange,
  readOnly = false,
  className = "",
  inputClassName = "",
}) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!focused) {
      setDraft(String(amount || ""));
    }
  }, [amount, focused]);

  if (readOnly) {
    return <span className={className}>{formatCurrency(amount)}</span>;
  }

  const handleFocus = () => {
    setFocused(true);
    setDraft(String(amount || ""));
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseCurrencyInput(draft);
    onChange?.(parsed);
  };

  const handleChange = (e) => {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setDraft(digits);
    onChange?.(parseCurrencyInput(digits));
  };

  const displayValue = focused
    ? draft
      ? `$${Number(draft).toLocaleString("en-US")}`
      : ""
    : formatCurrency(amount);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      className={inputClassName || className}
    />
  );
}
