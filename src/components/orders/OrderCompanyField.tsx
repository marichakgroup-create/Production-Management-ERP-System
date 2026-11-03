"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Field";
import { OrderPartyDetails } from "@/components/orders/OrderPartyDetails";
import { updateOrderCompanyAction } from "@/server/domains/orders/actions";

export type CompanyOption = {
  id: string;
  legalName: string;
  isDefault?: boolean;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  iban?: string | null;
};

export function OrderCompanyField({
  orderId,
  companies,
  selectedId,
  canEdit,
}: {
  orderId: string;
  companies: CompanyOption[];
  selectedId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const value = selectedId ?? companies.find((row) => row.isDefault)?.id ?? companies[0]?.id ?? "";
  const selected = companies.find((row) => row.id === value) ?? null;

  if (companies.length === 0) return null;

  function save(companySettingsId: string) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("companySettingsId", companySettingsId);
    startTransition(async () => {
      await updateOrderCompanyAction(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Select
        label="Компанія"
        size="sm"
        disabled={!canEdit || pending}
        value={value}
        onChange={(event) => save(event.target.value)}
      >
        {companies.map((row) => (
          <option key={row.id} value={row.id}>
            {row.isDefault ? `${row.legalName} (основна)` : row.legalName}
          </option>
        ))}
      </Select>
      <OrderPartyDetails
        rows={[
          { label: "Адреса", value: selected?.address },
          { label: "Телефон", value: selected?.phone },
          { label: "Email", value: selected?.email },
          { label: "ЄДРПОУ", value: selected?.taxId, code: true },
          { label: "IBAN", value: selected?.iban, code: true },
        ]}
      />
    </div>
  );
}
