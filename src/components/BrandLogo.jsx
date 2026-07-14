const sizeClasses = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
  hero: "text-4xl sm:text-5xl",
};

/**
 * CarFlipAnalyzer wordmark — navy "CarFlip" + green "Analyzer".
 * Use variant="onDark" on dark backgrounds.
 */
export default function BrandLogo({
  className = "",
  size = "md",
  variant = "default",
}) {
  const flipColor =
    variant === "onDark" ? "text-white" : "text-brand-navy";

  return (
    <span
      className={`inline-flex font-bold tracking-tight ${sizeClasses[size] || sizeClasses.md} ${className}`}
      aria-label="CarFlipAnalyzer"
    >
      <span className={flipColor}>CarFlip</span>
      <span className="text-brand-green">Analyzer</span>
    </span>
  );
}
