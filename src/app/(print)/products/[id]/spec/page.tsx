import { notFound, redirect } from "next/navigation";
import { getProduct } from "@/server/domains/products/service";
import { prisma } from "@/server/db/client";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import {
  PrintDocChip,
  PrintDocChips,
  PrintDocColumns,
  PrintDocFooter,
  PrintDocHeader,
  PrintDocMuted,
  PrintDocSection,
  PrintDocTable,
  PrintDocument,
} from "@/components/print/PrintDocument";
import { formatAmountWhole, formatDateUk, formatMoneyUah, formatUnit } from "@/lib/utils";
import { operationMethodLabel } from "@/lib/operation-labels";
import { sizeCodesFromScopes, sizeConsumptionFromNorms, sizeWasteFromNorms } from "@/lib/size-bom";

function fmtQty(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 }).format(value);
}

function sizeLabel(codes: string[] | null | undefined): string {
  if (!codes?.length) return "усі";
  return codes.join(", ");
}

function materialTypeLabel(type: string): string {
  if (type === "FABRIC") return "тканина";
  if (type === "TRIM") return "фурнітура";
  return "матеріал";
}

export default async function ProductSpecPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const { id } = await params;
  const [product, company] = await Promise.all([
    getProduct(id),
    prisma.companySettings.findFirst(),
  ]);
  if (!product) notFound();

  const canViewCosts = accessHas(access, "viewProductCosts");
  const companyName = company?.legalName ?? "Виробництво";
  const companyLines = [
    company?.address,
    [company?.phone, company?.email].filter(Boolean).join(" · ") || null,
  ].filter((line): line is string => Boolean(line?.trim()));

  const code = product.internalCode?.trim() || product.id.slice(-6).toUpperCase();
  const sizes = product.sizes.map((row) => row.size.nameUk ?? row.size.code);
  const photo = product.imageUrl?.trim() || null;
  const generated = formatDateUk(new Date());
  const facts = [
    product.internalCode ? `Артикул ${product.internalCode}` : null,
    product.category?.nameUk ?? null,
    product.sizeChartVariant?.nameUk ? `сітка ${product.sizeChartVariant.nameUk}` : null,
    product.isBaseModel ? "базова модель" : null,
    product.optimalQty ? `оптимум ${product.optimalQty} шт` : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <>
      <PrintToolbar
        backHref={`/products/${product.id}`}
        backLabel="До виробу"
        title={`Специфікація · ${product.nameUk}`}
      />
      <PrintDocument runningTitle={`${companyName} · ${product.nameUk}`}>
        <PrintDocHeader
          companyName={companyName}
          companyLines={companyLines}
          docType="Специфікація виробу"
          docNumber={code}
          docMeta={[generated, product.status === "ARCHIVED" ? "Архів" : null].filter(
            (line): line is string => Boolean(line),
          )}
        />

        <PrintDocSection>
          <div className={photo ? "print-doc-hero" : "print-doc-hero print-doc-hero--text"}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="print-doc-hero-photo" src={photo} alt={product.nameUk} />
            ) : null}
            <div>
              <h2 className="print-doc-hero-name">{product.nameUk}</h2>
              {facts.length > 0 ? (
                <p className="print-doc-hero-facts">{facts.join(" · ")}</p>
              ) : null}
              {sizes.length > 0 ? (
                <PrintDocChips>
                  {sizes.map((size) => (
                    <PrintDocChip key={size}>{size}</PrintDocChip>
                  ))}
                </PrintDocChips>
              ) : (
                <PrintDocMuted>Розміри не задані</PrintDocMuted>
              )}
              {product.description?.trim() ? (
                <p className="print-doc-hero-facts" style={{ marginTop: 8 }}>
                  {product.description.trim()}
                </p>
              ) : null}
            </div>
          </div>
        </PrintDocSection>

        <PrintDocSection title="Матеріали">
          {product.materials.length === 0 ? (
            <PrintDocMuted>Немає рядків комплектації</PrintDocMuted>
          ) : (
            <PrintDocTable
              head={
                <tr>
                  <th>Матеріал</th>
                  <th>Колір</th>
                  <th className="num">Норма / од.</th>
                  <th className="num">Відходи</th>
                  <th>Розміри</th>
                </tr>
              }
              rows={
                <>
                  {product.materials.map((row) => {
                    const unit = formatUnit(row.material.unitOfMeasure.code);
                    const waste = Number(row.wastePercent ?? row.material.defaultWastePercent ?? 0);
                    const sizeCodes = sizeCodesFromScopes(row.sizeScopes);
                    const sizeConsumption = sizeConsumptionFromNorms(row.sizeNorms);
                    const sizeWaste = sizeWasteFromNorms(row.sizeNorms);
                    const sizeNormBits = Object.entries(sizeConsumption).map(([code, qty]) => {
                      const extraWaste = sizeWaste[code];
                      return extraWaste != null
                        ? `${code} ${fmtQty(qty)} (${fmtQty(extraWaste)}%)`
                        : `${code} ${fmtQty(qty)}`;
                    });
                    const meta = [
                      materialTypeLabel(row.material.type),
                      row.material.composition?.trim() || null,
                      row.material.densityGsm ? `${row.material.densityGsm} г/м²` : null,
                      row.material.widthCm ? `${row.material.widthCm} см` : null,
                      row.supplier?.nameUk ?? null,
                    ].filter((bit): bit is string => Boolean(bit));
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.material.nameUk}</strong>
                          {meta.length ? (
                            <span className="print-doc-item-sub">{meta.join(" · ")}</span>
                          ) : null}
                          {sizeNormBits.length ? (
                            <span className="print-doc-item-sub">
                              Норми по розмірах: {sizeNormBits.join(" · ")}
                            </span>
                          ) : null}
                          {row.note?.trim() ? (
                            <span className="print-doc-item-sub">{row.note.trim()}</span>
                          ) : null}
                        </td>
                        <td>{row.colorSnapshot?.trim() || "—"}</td>
                        <td className="num">
                          {fmtQty(Number(row.consumptionPerUnit))} {unit}
                        </td>
                        <td className="num">{waste ? `${fmtQty(waste)}%` : "—"}</td>
                        <td>{sizeLabel(sizeCodes)}</td>
                      </tr>
                    );
                  })}
                </>
              }
            />
          )}
        </PrintDocSection>

        <PrintDocColumns>
          <PrintDocSection title="Операції">
            {product.operations.length === 0 ? (
              <PrintDocMuted>Немає операцій</PrintDocMuted>
            ) : (
              <PrintDocTable
                head={
                  <tr>
                    <th>Операція</th>
                    <th>Метод</th>
                    <th>Розміри</th>
                  </tr>
                }
                rows={
                  <>
                    {product.operations.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="print-doc-op-name">{row.operation.nameUk}</span>
                          {row.note?.trim() ? (
                            <span className="print-doc-item-sub">{row.note.trim()}</span>
                          ) : null}
                        </td>
                        <td>
                          <span className="print-doc-op-method">
                            {operationMethodLabel(row.operation.calculationMethod)}
                          </span>
                        </td>
                        <td>{sizeLabel(sizeCodesFromScopes(row.sizeScopes))}</td>
                      </tr>
                    ))}
                  </>
                }
              />
            )}
          </PrintDocSection>

          <PrintDocSection title="Нанесення">
            {product.decorations.length === 0 ? (
              <PrintDocMuted>Немає методів нанесення</PrintDocMuted>
            ) : (
              <PrintDocTable
                head={
                  <tr>
                    <th>Метод</th>
                    {canViewCosts ? <th className="num">Підготовка</th> : null}
                    {canViewCosts ? <th className="num">₴ / шт</th> : null}
                  </tr>
                }
                rows={
                  <>
                    {product.decorations.map((row) => {
                      const setup =
                        row.setupCostOverride != null
                          ? Number(row.setupCostOverride)
                          : Number(row.decorationMethod.setupCost);
                      return (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.decorationMethod.nameUk}</strong>
                            {row.note?.trim() ? (
                              <span className="print-doc-item-sub">{row.note.trim()}</span>
                            ) : null}
                          </td>
                          {canViewCosts ? (
                            <td className="num">{setup ? formatMoneyUah(setup) : "—"}</td>
                          ) : null}
                          {canViewCosts ? (
                            <td className="num">
                              {Number(row.decorationMethod.unitRate)
                                ? formatMoneyUah(Number(row.decorationMethod.unitRate))
                                : "—"}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </>
                }
              />
            )}
          </PrintDocSection>
        </PrintDocColumns>

        {canViewCosts &&
        (product.commercialPriceTiers.length > 0 || product.cutRateTiers.length > 0) ? (
          <PrintDocColumns>
            {product.commercialPriceTiers.length > 0 ? (
              <PrintDocSection title="Прайс">
                <div className="print-doc-ladder">
                  {product.commercialPriceTiers.map((tier) => (
                    <div key={tier.id} className="print-doc-ladder-item">
                      <span>від {tier.minQuantity} шт</span>
                      <strong>{formatAmountWhole(Number(tier.pricePerUnit))} ₴</strong>
                    </div>
                  ))}
                </div>
              </PrintDocSection>
            ) : (
              <div />
            )}
            {product.cutRateTiers.length > 0 ? (
              <PrintDocSection title="Крій">
                <div className="print-doc-ladder">
                  {product.cutRateTiers.map((tier) => (
                    <div key={tier.id} className="print-doc-ladder-item">
                      <span>від {tier.minQuantity} шт</span>
                      <strong>{formatAmountWhole(Number(tier.ratePerUnit))} ₴</strong>
                    </div>
                  ))}
                </div>
              </PrintDocSection>
            ) : (
              <div />
            )}
          </PrintDocColumns>
        ) : null}

        {canViewCosts && product.additionalCosts.length > 0 ? (
          <PrintDocSection title="Додаткові витрати">
            <PrintDocTable
              head={
                <tr>
                  <th>Стаття</th>
                  <th>Тип</th>
                  <th className="num">Сума</th>
                </tr>
              }
              rows={
                <>
                  {product.additionalCosts.map((row) => (
                    <tr key={row.id}>
                      <td>{row.nameUk}</td>
                      <td>{row.isPerUnit ? "на 1 шт" : "на тираж"}</td>
                      <td className="num">{formatMoneyUah(Number(row.amount))}</td>
                    </tr>
                  ))}
                </>
              }
            />
          </PrintDocSection>
        ) : null}

        <PrintDocFooter>
          <PrintDocMuted>Сформовано {generated}. Норми — на 1 виріб.</PrintDocMuted>
        </PrintDocFooter>
      </PrintDocument>
    </>
  );
}
