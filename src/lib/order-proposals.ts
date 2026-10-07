export type ProposalLineVersion = {
  id: string;
  orderItemId: string;
  itemNameUk: string;
  totalQuantity: number;
  versionNumber: number;
  sellingPricePerUnit: number;
  totalSellingValue: number;
  marginPercent: number;
  costPerUnit: number;
};

export type OrderProposalGroup = {
  key: string;
  revision: number | null;
  label: string | null;
  comment: string | null;
  createdAt: string;
  authorName: string;
  isApproved: boolean;
  lines: ProposalLineVersion[];
  totalSellingValue: number;
  totalQuantity: number;
  isComplete: boolean;
};

type VersionInput = {
  id: string;
  orderItemId: string;
  versionNumber: number;
  label: string | null;
  comment: string | null;
  isApproved: boolean;
  createdAt: Date;
  proposalRevision: number | null;
  proposalLabel: string | null;
  sellingPricePerUnit: unknown;
  totalSellingValue: unknown;
  marginPercent: unknown;
  costPerUnit: unknown;
  author: { name: string };
};

type ItemInput = {
  id: string;
  nameUk: string;
  totalQuantity: number;
  /** Hidden from working composition; still carries proposal history. */
  superseded?: boolean;
  versions: VersionInput[];
};

function toLine(item: ItemInput, version: VersionInput): ProposalLineVersion {
  return {
    id: version.id,
    orderItemId: item.id,
    itemNameUk: item.nameUk,
    totalQuantity: item.totalQuantity,
    versionNumber: version.versionNumber,
    sellingPricePerUnit: Number(version.sellingPricePerUnit),
    totalSellingValue: Number(version.totalSellingValue),
    marginPercent: Number(version.marginPercent),
    costPerUnit: Number(version.costPerUnit),
  };
}

export function buildOrderProposals(items: ItemInput[]): OrderProposalGroup[] {
  const workingItemIds = new Set(
    items.filter((item) => !item.superseded).map((item) => item.id),
  );
  const grouped = new Map<number, { versions: Array<{ item: ItemInput; version: VersionInput }> }>();

  for (const item of items) {
    for (const version of item.versions) {
      if (version.proposalRevision == null) continue;
      const bucket = grouped.get(version.proposalRevision) ?? { versions: [] };
      bucket.versions.push({ item, version });
      grouped.set(version.proposalRevision, bucket);
    }
  }

  const proposals: OrderProposalGroup[] = [];

  for (const [revision, bucket] of grouped.entries()) {
    const lines = bucket.versions.map(({ item, version }) => toLine(item, version));
    const uniqueItems = new Set(lines.map((line) => line.orderItemId));
    const first = bucket.versions[0]!.version;
    // Approving requires the revision to cover every current working line.
    const matchesWorking =
      workingItemIds.size > 0 &&
      uniqueItems.size === workingItemIds.size &&
      [...workingItemIds].every((id) => uniqueItems.has(id));
    proposals.push({
      key: `rev-${revision}`,
      revision,
      label: first.proposalLabel ?? first.label,
      comment: first.comment,
      createdAt: first.createdAt.toISOString(),
      authorName: first.author.name,
      isApproved: bucket.versions.every(({ version }) => version.isApproved),
      lines: lines.sort((a, b) => a.itemNameUk.localeCompare(b.itemNameUk, "uk")),
      totalSellingValue: lines.reduce((sum, line) => sum + line.totalSellingValue, 0),
      totalQuantity: lines.reduce((sum, line) => sum + line.totalQuantity, 0),
      isComplete: matchesWorking || (workingItemIds.size === 0 && uniqueItems.size > 0),
    });
  }

  for (const item of items) {
    for (const version of item.versions) {
      if (version.proposalRevision != null) continue;
      const line = toLine(item, version);
      proposals.push({
        key: `legacy-${version.id}`,
        revision: null,
        label: version.proposalLabel ?? version.label,
        comment: version.comment,
        createdAt: version.createdAt.toISOString(),
        authorName: version.author.name,
        isApproved: version.isApproved,
        lines: [line],
        totalSellingValue: line.totalSellingValue,
        totalQuantity: line.totalQuantity,
        isComplete: items.length === 1,
      });
    }
  }

  return proposals.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function latestCompleteProposal(items: ItemInput[]): OrderProposalGroup | null {
  const proposals = buildOrderProposals(items).filter((row) => row.isComplete);
  return proposals[0] ?? null;
}

export function approvedProposal(items: ItemInput[]): OrderProposalGroup | null {
  return buildOrderProposals(items).find((row) => row.isComplete && row.isApproved) ?? null;
}

export function quotationProposal(items: ItemInput[]) {
  const approved = approvedProposal(items);
  if (approved) return approved;
  return latestCompleteProposal(items);
}
