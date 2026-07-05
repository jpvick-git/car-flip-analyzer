import React, { useEffect, useState } from "react";
import { formatCurrency, normalizeDigitInput, parseCurrencyInput } from "../utils/formatCurrency";

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
      setDraft(amount ? String(amount) : "");
    }
  }, [amount, focused]);

  if (readOnly) {
    return <span className={className}>{formatCurrency(amount)}</span>;
  }

  const handleFocus = (e) => {
    setFocused(true);
    setDraft(amount ? String(amount) : "");
    requestAnimationFrame(() => e.target.select());
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseCurrencyInput(draft);
    onChange?.(parsed);
    setDraft(parsed ? String(parsed) : "");
  };

  const handleChange = (e) => {
    const normalized = normalizeDigitInput(e.target.value);
    setDraft(normalized);
    onChange?.(parseCurrencyInput(normalized));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={focused ? draft : formatCurrency(amount)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      className={inputClassName || className}
    />
  );
}
