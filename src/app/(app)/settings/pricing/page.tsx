import { redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/ui/Page";
import { Input } from "@/components/ui/Input";
import { Select, FormGroup } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { SettingsForm } from "@/components/ui/SettingsForm";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";
import { updatePricingSettingsAction } from "@/server/domains/settings/actions";

export default async function PricingSettingsPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const canEdit = accessHas(access, "managePricingRules");
  const pricing = await prisma.pricingSettings.findFirst().catch(() => null);

  const minimum = Number(pricing?.minimumMarginPercent ?? 15);

  return (
    <div>
      <PageHeader
        title="Ціноутворення"
        description="Продажна ціна фіксується в базовому прайсі виробу (націнка на пошив × тираж). Тут — контроль мінімальної маржі, знижок і закупівельних параметрів тканин."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:items-start">
        <div className="space-y-4">
          <div className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <SettingsForm
              id="pricing-rules"
              action={updatePricingSettingsAction}
              readOnly={!canEdit}
              description="Не додає % до собівартості автоматично — клієнтська ціна береться з прайсу виробу"
            >
              {/* Kept for schema compatibility; selling uplift is disabled in calc (rate = 0). */}
              <input type="hidden" name="pricingMethod" value="MARKUP" />
              <input type="hidden" name="targetMarginPercent" value="0" />

              <FormGroup label="Контроль пропозицій" columns={2}>
                <Input
                  name="minimumMarginPercent"
                  label="Мінімальна фактична маржа, %"
                  type="number"
                  step="0.1"
                  min="0"
                  max="99"
                  defaultValue={minimum}
                  hint="Від собівартості до ціни з прайсу; нижче — підтвердження адміна"
                />
                <Input
                  name="managerMaxDiscountPercent"
                  label="Максимальна знижка, %"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  defaultValue={Number(pricing?.managerMaxDiscountPercent ?? 0)}
                />
              </FormGroup>

              <FormGroup label="Округлення" columns={2}>
                <Select name="roundingRule" label="Округлення грошей" defaultValue={pricing?.roundingRule ?? "ROUND_2"}>
                  <option value="ROUND_2">До копійок (0.01)</option>
                  <option value="ROUND_1">До 0.10 ₴</option>
                  <option value="ROUND_0">До гривні</option>
                </Select>
              </FormGroup>

              <FormGroup label="Закупівля тканин (курс і доставка)" columns={2}>
                <Input
                  name="usdUahRate"
                  label="Курс доллара, грн"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={Number(pricing?.usdUahRate ?? 45)}
                />
                <Input
                  name="fabricCargoUsdPerKg"
                  label="CARGO, $/кг"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={Number(pricing?.fabricCargoUsdPerKg ?? 1.7)}
                />
                <Input
                  name="npStandardUsdPerKg"
                  label="НП стандарт, $/кг"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={Number(pricing?.npStandardUsdPerKg ?? 0.4)}
                  hint="Не змінювати без потреби (стандарт 0,4 $/кг)"
                />
                <Input
                  name="npVolumeUsdPerKg"
                  label="НП обʼємні, $/кг"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={Number(pricing?.npVolumeUsdPerKg ?? 0.8)}
                />
              </FormGroup>

              <FormGroup label="ПДВ у собівартості матеріалів" columns={2}>
                <Select
                  name="materialCostVatMode"
                  label="Що йде в розрахунок виробу"
                  defaultValue={pricing?.materialCostVatMode ?? "NET"}
                >
                  <option value="NET">Без ПДВ — якщо ПДВ повертається</option>
                  <option value="GROSS">З ПДВ — повна ціна закупки</option>
                </Select>
                <Input
                  name="inputVatRatePercent"
                  label="Ставка ПДВ (довідково), %"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  defaultValue={Number(pricing?.inputVatRatePercent ?? 20)}
                />
              </FormGroup>
            </SettingsForm>
          </div>
        </div>

        <div className="space-y-4">
          <Banner tone="info" title="Як формується ціна клієнту">
            1) У картці виробу («Прайс і крій») крій змінюється з тиражем автоматично.
            2) Націнку ставите вручну як множник до пошиву (не до тканини) і фіксуєте прайс.
            3) У замовленні продажна ціна береться з цього прайсу; собівартість лишається для планування.
          </Banner>

          <Banner tone="info" title="ПДВ у собівартості">
            У каталозі тканин зберігаються обидві ціни (з ПДВ і без). У калькуляцію виробу йде та,
            яку обрано вище. На окремій тканині можна зробити виняток.
          </Banner>

          <Banner tone="warning" title="Зміна правил не переписує історію">
            Погоджені версії та специфікації зберігають зафіксовані ціни. Щоб застосувати новий прайс,
            оновіть прайс на виробі і збережіть нову версію пропозиції.
          </Banner>
        </div>
      </div>
    </div>
  );
}
