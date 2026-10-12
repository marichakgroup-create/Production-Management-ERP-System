import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/Page";
import { Banner } from "@/components/ui/Banner";
import { ViewTabs } from "@/components/ui/Tabs";
import { ScreenPrintAdminPanel } from "@/components/settings/ScreenPrintAdminPanel";
import { DecorationFormatsAdminPanel } from "@/components/settings/DecorationFormatsAdminPanel";
import { getScreenPrintCatalog } from "@/server/domains/screen-print/service";
import { getDecorationFormatsCatalog } from "@/server/domains/decoration-formats/service";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";

type DecorationsTab = "screen-print" | "formats";

function parseTab(raw: string | undefined): DecorationsTab {
  if (raw === "formats" || raw === "decorations") return "formats";
  return "screen-print";
}

export default async function ApplicationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");
  if (!accessHas(access, "manageCatalogs")) redirect("/overview");

  const { tab: tabRaw } = await searchParams;
  const tab = parseTab(tabRaw);

  let screenPrint: Awaited<ReturnType<typeof getScreenPrintCatalog>> | null = null;
  let decorationFormats: Awaited<ReturnType<typeof getDecorationFormatsCatalog>> = [];
  let screenPrintError = false;
  let formatsError = false;

  const [screenPrintResult, formatsResult] = await Promise.allSettled([
    getScreenPrintCatalog(),
    getDecorationFormatsCatalog({ includeArchived: true }),
  ]);

  if (screenPrintResult.status === "fulfilled") {
    screenPrint = screenPrintResult.value;
  } else {
    screenPrintError = true;
  }

  if (formatsResult.status === "fulfilled") {
    decorationFormats = formatsResult.value;
  } else {
    formatsError = true;
  }

  const activeFormats = decorationFormats.filter((row) => row.status === "ACTIVE").length;

  return (
    <div>
      <PageHeader
        title="Нанесення"
        description={
          tab === "formats"
            ? "Розцінки нанесення за форматом і тиражем. У замовленні ставка підставляється автоматично."
            : "Таблиця: тираж × кольори × ціна. Новий тираж або коефіцієнт — порожній рядок знизу."
        }
      />

      <ViewTabs
        className="mb-4"
        active={tab}
        items={[
          {
            key: "screen-print",
            label: "Шовкотрафарет",
            href: "/settings/applications",
          },
          {
            key: "formats",
            label: "Операції нанесення",
            href: "/settings/applications?tab=formats",
            count: activeFormats > 0 ? activeFormats : undefined,
          },
        ]}
      />

      {tab === "formats" ? (
        formatsError ? (
          <Banner tone="danger" title="Не вдалося завантажити формати нанесення" className="mb-4">
            Перевірте <code>DATABASE_URL</code> і перезапустіть <code>next dev</code> після{" "}
            <code>prisma migrate</code> / <code>prisma generate</code>.
          </Banner>
        ) : (
          <DecorationFormatsAdminPanel formats={decorationFormats} />
        )
      ) : screenPrintError || !screenPrint ? (
        <Banner tone="danger" title="Не вдалося завантажити шовкотрафарет" className="mb-4">
          Перевірте <code>DATABASE_URL</code> і перезапустіть <code>next dev</code> після{" "}
          <code>prisma generate</code>.
        </Banner>
      ) : (
        <ScreenPrintAdminPanel
          cells={screenPrint.cells}
          coefficients={screenPrint.coefficients}
        />
      )}
    </div>
  );
}
