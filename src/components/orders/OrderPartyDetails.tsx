export type PartyDetail = {
  label: string;
  value?: string | null;
  /** Keep long codes on one line and group them for scanning. */
  code?: boolean;
};

function formatCode(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (!/^[A-Za-z]{2}\d[\dA-Za-z]+$/.test(compact) && !/^\d+$/.test(compact)) return value.trim();
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

/** Compact labeled facts under a party selector. Empty rows are omitted. */
export function OrderPartyDetails({ rows }: { rows: PartyDetail[] }) {
  const visible = rows.flatMap((row) => {
    const value = row.value?.trim();
    if (!value) return [];
    return [{ ...row, value: row.code ? formatCode(value) : value }];
  });
  if (visible.length === 0) return null;

  return (
    <dl className="space-y-1">
      {visible.map((row) => (
        <div key={row.label} className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-x-2">
          <dt className="text-[11px] leading-4 text-[var(--color-text-tertiary)]">{row.label}</dt>
          <dd
            className={
              row.code
                ? "min-w-0 break-all font-medium tabular-nums tracking-[0.01em] text-[12px] leading-4 text-[var(--color-text-primary)]"
                : "min-w-0 break-words text-[12px] leading-4 text-[var(--color-text-primary)]"
            }
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
