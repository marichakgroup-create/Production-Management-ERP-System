import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/Page";
import { HeaderBlock } from "@/components/ui/ObjectHeader";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";
import { listCompanies } from "@/server/domains/settings/company";
import { CompanySettingsManager } from "@/components/settings/CompanySettingsManager";

export default async function CompanySettingsPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const canEdit = accessHas(access, "managePricingRules");
  const companies = await listCompanies();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Компанія та документи"
        description="Реквізити продавця для КП і специфікацій. У замовленні можна обрати, від якої компанії йде документ."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <CompanySettingsManager
          companies={companies.map((row) => ({
            id: row.id,
            legalName: row.legalName,
            address: row.address,
            phone: row.phone,
            email: row.email,
            taxId: row.taxId,
            quotationFooter: row.quotationFooter,
            isDefault: row.isDefault,
          }))}
          canEdit={canEdit}
        />
        <HeaderBlock title="Де це використовується">
          <ul className="space-y-2 text-[13px] text-[var(--color-text-secondary)]">
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Замовлення</span> —
              компанію можна обрати при створенні та змінити в шапці картки.
            </li>
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Комерційна пропозиція</span> —
              шапка з реквізитами та підвал з умовами обраної компанії.
            </li>
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Специфікація</span> — назва
              компанії у заголовку документа.
            </li>
          </ul>
        </HeaderBlock>
      </div>
    </div>
  );
}
