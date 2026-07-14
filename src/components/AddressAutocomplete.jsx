import React, { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { MIN_QUERY_LENGTH, searchAddresses } from "../utils/addressSearch";

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing a city or address…",
  disabled = false,
  readOnly = false,
  inputClassName = "",
  className = "",
}) {
  const listId = useId();
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);
  const requestRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState(null);

  const isDisabled = disabled || readOnly;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = (query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = String(query || "").trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestRef.current;
      try {
        const results = await searchAddresses(trimmed);
        if (requestId !== requestRef.current) return;
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIndex(-1);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        console.error("Address search failed:", err);
        setSuggestions([]);
        setOpen(false);
        setError("Could not load suggestions");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 280);
  };

  const pickSuggestion = (suggestion) => {
    onChange(suggestion.label);
    onSelect?.(suggestion);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const defaultInputClass =
    "w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50";

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={isDisabled}
          readOnly={readOnly}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isDisabled) runSearch(e.target.value);
          }}
          onFocus={() => {
            if (!isDisabled && suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={inputClassName || defaultInputClass}
        />
        {loading && (
          <Loader2
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
          />
        )}
      </div>

      {error && (
        <p className="mt-1 text-xs text-amber-600">{error}</p>
      )}

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                  index === activeIndex ? "bg-blue-50" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(item)}
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  <span className="block font-medium text-slate-800">{item.label}</span>
                  {item.secondary && (
                    <span className="block text-xs text-slate-500">{item.secondary}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !open && value && String(value).trim().length >= MIN_QUERY_LENGTH && (
        <p className="mt-1 text-[11px] text-slate-400">
          Distance auto-calculates when pickup and delivery are both set.
        </p>
      )}
    </div>
  );
}
