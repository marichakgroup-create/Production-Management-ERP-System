import { prisma } from "@/server/db/client";
import type { Prisma } from "@prisma/client";

export type ActivityEntityType = "order" | "client" | "product";

export type ActivityAction =
  | "created"
  | "status_changed"
  | "version_saved"
  | "version_approved"
  | "proposal_saved"
  | "proposal_approved"
  | "proposal_activated"
  | "handed_to_production"
  | "updated";

export async function recordActivity(input: {
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  userId?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  return prisma.activityEvent.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      userId: input.userId || null,
      payload: input.payload ?? undefined,
    },
  });
}

export async function listEntityActivity(entityType: ActivityEntityType, entityId: string, take = 30) {
  return prisma.activityEvent.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}

export async function listRecentActivity(take = 12) {
  return prisma.activityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}

/** Ukrainian labels for activity timeline. */
export function activityActionLabel(action: string): string {
  switch (action) {
    case "created":
      return "Створено";
    case "status_changed":
      return "Змінено статус";
    case "version_saved":
      return "Збережено пропозицію";
    case "version_approved":
      return "Погоджено пропозицію";
    case "proposal_saved":
      return "Збережено пропозицію";
    case "proposal_approved":
      return "Погоджено пропозицію";
    case "proposal_activated":
      return "Активовано пропозицію";
    case "handed_to_production":
      return "Передано у виробництво";
    case "updated":
      return "Оновлено";
    default:
      return action;
  }
}
