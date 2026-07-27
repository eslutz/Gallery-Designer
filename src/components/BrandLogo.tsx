export function BrandLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 56 48" aria-hidden="true" focusable="false">
      <path
        d="M3 3h50v25H31v17H3z"
        fill="var(--piece-selected-fill)"
        stroke="var(--wall-edge)"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <rect
        x="9"
        y="9"
        width="11"
        height="13"
        rx="1.5"
        fill="var(--piece-fill)"
        stroke="var(--primary-background)"
        strokeWidth="2.5"
      />
      <rect
        x="26"
        y="9"
        width="19"
        height="11"
        rx="1.5"
        fill="var(--piece-fill)"
        stroke="var(--primary-background)"
        strokeWidth="2.5"
      />
      <rect
        x="9"
        y="28"
        width="15"
        height="10"
        rx="1.5"
        fill="var(--piece-fill)"
        stroke="var(--primary-background)"
        strokeWidth="2.5"
      />
    </svg>
  );
}
