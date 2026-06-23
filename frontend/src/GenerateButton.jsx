import { IconGenerate } from "./icons";

const IDLE = {
  bg: "#CFE0FF",
  color: "var(--generate-idle)",
  border: "none",
  boxShadow: "none",
};

const ACTIVE = {
  bg: "#498BFF",
  color: "var(--generate-active)",
  border: "0.5px solid #1E60D5",
  borderBottom: "1px solid #1E60D5",
  boxShadow:
    "0 2px 3px 0 rgba(255, 255, 255, 0.25) inset, 0 4px 4px 0 rgba(166, 184, 255, 0.25)",
};

export default function GenerateButton({ onClick, disabled, hasText, shaking, onShakeEnd }) {
  const theme = hasText ? ACTIVE : IDLE;

  return (
    <button
      className={`generate-btn${shaking ? " shake" : ""}`}
      onClick={onClick}
      disabled={disabled}
      onAnimationEnd={onShakeEnd}
      data-visitors-event="generate-btn"
      style={{
        display: "flex",
        padding: "0.625rem 0.75rem 0.625rem 1rem",
        justifyContent: "center",
        alignItems: "center",
        gap: "0.25rem",
        borderRadius: "6.25rem",
        background: theme.bg,
        color: theme.color,
        border: theme.border,
        borderBottom: theme.borderBottom,
        boxShadow: theme.boxShadow,
        transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      Generate
      <IconGenerate size={18} />
    </button>
  );
}
