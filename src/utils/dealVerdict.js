const TONE_STYLES = {
  good: {
    bg: "bg-emerald-600",
    bgLight: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    textMuted: "text-emerald-600/80",
    dot: "bg-emerald-400",
  },
  marginal: {
    bg: "bg-amber-500",
    bgLight: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    textMuted: "text-amber-700/80",
    dot: "bg-amber-400",
  },
  pass: {
    bg: "bg-slate-600",
    bgLight: "bg-slate-100",
    border: "border-slate-200",
    text: "text-slate-700",
    textMuted: "text-slate-500",
    dot: "bg-slate-400",
  },
};

/**
 * Good / Marginal / Pass verdict for the 2a split-card treatment.
 */
export function getDealVerdict({
  profit,
  marginActual,
  targetMargin,
  bid,
  asking,
  resale,
  redFlagCount = 0,
}) {
  const target = Number(targetMargin) || 15;
  const styles = TONE_STYLES.pass;
  const base = { label: "Pass", tone: "pass", styles };

  if (!resale || resale <= 0) {
    return {
      ...base,
      summary: "Insufficient resale data to score this deal.",
    };
  }

  if (profit <= 0) {
    return {
      ...base,
      summary: "Costs exceed resale at your target margin.",
    };
  }

  if (redFlagCount >= 3) {
    return {
      label: "Pass",
      tone: "pass",
      styles: TONE_STYLES.pass,
      summary: `${redFlagCount} red flags — proceed with extreme caution.`,
    };
  }

  if (asking && bid > 0) {
    const gap = asking - bid;
    const gapPct = (gap / asking) * 100;

    if (bid >= asking && marginActual >= target * 0.75) {
      return {
        label: "Good",
        tone: "good",
        styles: TONE_STYLES.good,
        summary: "At or below seller ask with healthy margin.",
      };
    }

    if (gapPct <= 8 && marginActual >= target * 0.7) {
      return {
        label: "Good",
        tone: "good",
        styles: TONE_STYLES.good,
        summary: `Ask is ~${Math.round(gapPct)}% above max — likely negotiable.`,
      };
    }

    if (gapPct <= 18 && profit > 0) {
      return {
        label: "Marginal",
        tone: "marginal",
        styles: TONE_STYLES.marginal,
        summary: `Need about $${Math.round(gap).toLocaleString()} off the ask.`,
      };
    }

    return {
      ...base,
      summary: "Ask is too far above your max offer.",
    };
  }

  if (marginActual >= target * 0.9) {
    return {
      label: "Good",
      tone: "good",
      styles: TONE_STYLES.good,
      summary: `${marginActual}% projected margin meets your ${target}% target.`,
    };
  }

  if (profit > 0 && marginActual >= target * 0.5) {
    return {
      label: "Marginal",
      tone: "marginal",
      styles: TONE_STYLES.marginal,
      summary: "Thin margin — double-check repair and resale assumptions.",
    };
  }

  return {
    ...base,
    summary: "Does not meet your margin target.",
  };
}
