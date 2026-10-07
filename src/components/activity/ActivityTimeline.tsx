import { activityActionLabel } from "@/server/domains/activity/service";
import { formatDateTimeUk } from "@/lib/utils";
import { HeaderBlock } from "@/components/ui/ObjectHeader";
import { IconClock } from "@/components/ui/Icons";

export type ActivityRow = {
  id: string;
  action: string;
  createdAt: Date | string;
  userName: string | null;
  detail?: string | null;
};

function detailFromPayload(action: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (action === "version_saved" || action === "version_approved") {
    const n = data.versionNumber;
    return typeof n === "number" ? `v${n}` : null;
  }
  if (
    action === "proposal_saved" ||
    action === "proposal_approved" ||
    action === "proposal_activated"
  ) {
    const n = data.proposalRevision;
    return typeof n === "number" ? `v${n}` : null;
  }
  if (action === "status_changed") {
    const from = typeof data.fromLabel === "string" ? data.fromLabel : null;
    const to = typeof data.toLabel === "string" ? data.toLabel : null;
    if (from && to) return `${from} → ${to}`;
  }
  if (action === "created" && typeof data.number === "string") {
    return data.number;
  }
  if (action === "handed_to_production" && typeof data.itemCount === "number") {
    return `${data.itemCount} поз.`;
  }
  return null;
}

export function mapActivityEvents(
  events: Array<{
    id: string;
    action: string;
    createdAt: Date;
    payload: unknown;
    user: { name: string | null } | null;
  }>,
): ActivityRow[] {
  return events.map((event) => ({
    id: event.id,
    action: event.action,
    createdAt: event.createdAt,
    userName: event.user?.name ?? null,
    detail: detailFromPayload(event.action, event.payload),
  }));
}

export function ActivityTimeline({
  events,
  title = "Історія",
  empty = "Подій ще немає",
}: {
  events: ActivityRow[];
  title?: string;
  empty?: string;
}) {
  return (
    <HeaderBlock title={title} icon={<IconClock size={16} />}>
      {events.length === 0 ? (
        <p className="type-body-secondary">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {events.map((event) => (
            <li key={event.id} className="flex gap-2.5 text-[13px]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary-400)]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {activityActionLabel(event.action)}
                  </span>
                  {event.detail ? (
                    <span className="tabular text-[var(--color-text-secondary)]">{event.detail}</span>
                  ) : null}
                </div>
                <p className="type-caption mt-0.5">
                  {formatDateTimeUk(event.createdAt)}
                  {event.userName ? ` · ${event.userName}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HeaderBlock>
  );
}
