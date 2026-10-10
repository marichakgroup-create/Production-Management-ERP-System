/**
 * Control: purge orders → seed decoration matrix → create orders → verify calc.
 * Run: npx tsx scripts/decoration-formats.control.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "../src/server/db/client";
import {
  addOrderItemDecorationWithRates,
  createOrderWithProducts,
  updateOrderItemDecoration,
  updateOrderItemSizes,
} from "../src/server/domains/orders/service";
import { buildCalcFromOrderItem } from "../src/server/domains/calculation/from-entities";
import { getPricingDefaults } from "../src/server/domains/calculation/from-entities";
import { getProduct } from "../src/server/domains/products/service";
import { ensureDecorationFormatsCatalog } from "../src/server/domains/decoration-formats/service";
import {
  decorationFormatLineName,
  mapDecorationFormatTiers,
  resolveDecorationFormatRate,
} from "../src/lib/decoration-format-pricing";

type Row = { ok: boolean; name: string; detail: string };
const report: Row[] = [];

function log(ok: boolean, name: string, detail: string) {
  report.push({ ok, name, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
}

function assertClose(actual: number, expected: number, eps = 0.02) {
  return Math.abs(actual - expected) <= eps;
}

async function purgeAllOrders(): Promise<number> {
  const orders = await prisma.order.findMany({ select: { id: true } });
  if (orders.length === 0) return 0;
  const orderIds = orders.map((o) => o.id);
  await prisma.$transaction(async (tx) => {
    await tx.quotation.deleteMany({
      where: { calculationVersion: { orderItem: { orderId: { in: orderIds } } } },
    });
    await tx.productionSpecification.deleteMany({
      where: { orderItem: { orderId: { in: orderIds } } },
    });
    await tx.fileAsset.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.activityEvent.deleteMany({
      where: { entityType: "order", entityId: { in: orderIds } },
    });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
  });
  return orders.length;
}

async function loadProduct() {
  const product = await prisma.product.findFirst({
    where: { internalCode: "SEED-TS-BASIC", status: "ACTIVE" },
    select: { id: true },
  });
  if (!product) {
    const any = await prisma.product.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    if (!any) throw new Error("No ACTIVE product — run db:seed");
    return getProduct(any.id);
  }
  return getProduct(product.id);
}

function sizesFor(product: NonNullable<Awaited<ReturnType<typeof getProduct>>>, total: number) {
  const codes =
    product!.sizes.length > 0
      ? product!.sizes.map((s) => ({ code: s.size.code, nameUk: s.size.nameUk }))
      : [{ code: "ONE", nameUk: "Без розміру" }];
  const base = Math.floor(total / codes.length);
  let rem = total - base * codes.length;
  return codes.map((s) => {
    const q = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return { sizeCode: s.code, sizeNameUk: s.nameUk, quantity: q };
  });
}

async function reloadItem(orderItemId: string) {
  return prisma.orderItem.findUniqueOrThrow({
    where: { id: orderItemId },
    include: {
      sizes: true,
      materials: true,
      operations: true,
      decorations: { orderBy: { sortOrder: "asc" } },
      additionalCosts: true,
      product: {
        include: {
          cutRateTiers: true,
          commercialPriceTiers: true,
          operations: {
            include: {
              rateTiers: true,
              operation: { include: { rateTiers: true } },
            },
          },
        },
      },
    },
  });
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: "admin@example.com" } });
  const client = await prisma.client.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin || !client) throw new Error("Run npm run db:seed first");

  const removed = await purgeAllOrders();
  log(true, "purge", `видалено ${removed} замовлень`);
  log((await prisma.order.count()) === 0, "purge empty", `залишок=${await prisma.order.count()}`);

  await ensureDecorationFormatsCatalog();
  const formats = await prisma.decorationFormat.findMany({
    where: { status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    include: { tiers: { orderBy: { minQuantity: "asc" } } },
  });
  log(formats.length >= 7, "formats", `${formats.length} активних форматів`);

  const f5 = formats.find((f) => /5\s*×\s*5/i.test(f.nameUk));
  const f10 = formats.find((f) => /10\s*×\s*10/i.test(f.nameUk));
  if (!f5 || !f10) throw new Error("Missing 5×5 / 10×10 formats");

  const tiers5 = mapDecorationFormatTiers(f5.tiers);
  const tiers10 = mapDecorationFormatTiers(f10.tiers);

  // Lookup unit tests
  log(resolveDecorationFormatRate({ quantity: 10, tiers: tiers5 }) === 45, "tier <20", "10→45");
  log(resolveDecorationFormatRate({ quantity: 30, tiers: tiers5 }) === 45, "tier 30", "30→45");
  log(resolveDecorationFormatRate({ quantity: 80, tiers: tiers5 }) === 35, "tier 80", "80→35");
  log(resolveDecorationFormatRate({ quantity: 150, tiers: tiers5 }) === 29, "tier 150", "150→29");
  log(resolveDecorationFormatRate({ quantity: 30, tiers: tiers10 }) === 55, "tier 10×10@30", "→55");

  const product = await loadProduct();
  if (!product) throw new Error("product null");
  const pricing = await getPricingDefaults();

  // --- Order A: 30 шт · два 5×5 + один 10×10 · без приладки ---
  {
    const qty = 30;
    const { order, items } = await createOrderWithProducts({
      clientId: client.id,
      managerId: admin.id,
      title: "[CTRL] Нанесення 30шт · 2×5×5 + 10×10",
      items: [{ productId: product.id, sizeQuantities: sizesFor(product, qty) }],
    });
    const itemId = items[0]!.id;
    const r5 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers5 });
    const r10 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers10 });

    await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f5.nameUk),
      setupCost: 0,
      unitRate: r5,
      decorationFormatId: f5.id,
    });
    await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f5.nameUk),
      setupCost: 0,
      unitRate: r5,
      decorationFormatId: f5.id,
    });
    await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f10.nameUk),
      setupCost: 0,
      unitRate: r10,
      decorationFormatId: f10.id,
    });

    const item = await reloadItem(itemId);
    const calc = buildCalcFromOrderItem(item, pricing);
    const expected = 45 * 30 + 45 * 30 + 55 * 30; // 4350
    const actual = Number(calc.decorationsSubtotal);
    log(
      assertClose(actual, expected) && item.decorations.length === 3,
      "A calc @30",
      `№${order.number}: decorations=${actual} (очікувано ${expected}), рядків=${item.decorations.length}`,
    );
  }

  // --- Order B: ті самі формати + приладки 100 / 0 / 250 ---
  {
    const qty = 30;
    const { order, items } = await createOrderWithProducts({
      clientId: client.id,
      managerId: admin.id,
      title: "[CTRL] Нанесення + приладки",
      items: [{ productId: product.id, sizeQuantities: sizesFor(product, qty) }],
    });
    const itemId = items[0]!.id;
    const r5 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers5 });
    const r10 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers10 });

    const d1 = await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f5.nameUk),
      setupCost: 0,
      unitRate: r5,
      decorationFormatId: f5.id,
    });
    const d2 = await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f5.nameUk),
      setupCost: 0,
      unitRate: r5,
      decorationFormatId: f5.id,
    });
    const d3 = await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f10.nameUk),
      setupCost: 0,
      unitRate: r10,
      decorationFormatId: f10.id,
    });

    await updateOrderItemDecoration({ id: d1.id, setupCost: 100 });
    await updateOrderItemDecoration({ id: d2.id, setupCost: 0 });
    await updateOrderItemDecoration({ id: d3.id, setupCost: 250 });

    const item = await reloadItem(itemId);
    const calc = buildCalcFromOrderItem(item, pricing);
    const expected = 100 + 0 + 250 + 45 * 30 + 45 * 30 + 55 * 30; // 4700
    const actual = Number(calc.decorationsSubtotal);
    log(
      assertClose(actual, expected),
      "B calc +setup",
      `№${order.number}: decorations=${actual} (очікувано ${expected})`,
    );
  }

  // --- Order C: 150 шт · reprice after qty change ---
  {
    const { order, items } = await createOrderWithProducts({
      clientId: client.id,
      managerId: admin.id,
      title: "[CTRL] Reprice 30→150",
      items: [{ productId: product.id, sizeQuantities: sizesFor(product, 30) }],
    });
    const itemId = items[0]!.id;
    const r5start = resolveDecorationFormatRate({ quantity: 30, tiers: tiers5 });
    await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f5.nameUk),
      setupCost: 0,
      unitRate: r5start,
      decorationFormatId: f5.id,
    });
    await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f5.nameUk),
      setupCost: 0,
      unitRate: r5start,
      decorationFormatId: f5.id,
    });
    await addOrderItemDecorationWithRates({
      orderItemId: itemId,
      nameUk: decorationFormatLineName(f10.nameUk),
      setupCost: 0,
      unitRate: resolveDecorationFormatRate({ quantity: 30, tiers: tiers10 }),
      decorationFormatId: f10.id,
    });

    await updateOrderItemSizes(itemId, sizesFor(product, 150));
    const item = await reloadItem(itemId);
    const rates = item.decorations.map((d) => Number(d.unitRate));
    const expectedRates = [29, 29, 43];
    const ratesOk =
      rates.length === 3 &&
      assertClose(rates[0]!, 29) &&
      assertClose(rates[1]!, 29) &&
      assertClose(rates[2]!, 43);

    const calc = buildCalcFromOrderItem(item, pricing);
    const expected = 29 * 150 + 29 * 150 + 43 * 150; // 15150
    const actual = Number(calc.decorationsSubtotal);
    log(
      ratesOk && assertClose(actual, expected),
      "C reprice @150",
      `№${order.number}: rates=[${rates.join(",")}] очікувано [${expectedRates.join(",")}], sum=${actual}`,
    );
  }

  // --- Order D: одне нанесення + приладка (залишаємо для UI) ---
  {
    const qty = 80;
    const { order, items } = await createOrderWithProducts({
      clientId: client.id,
      managerId: admin.id,
      title: "[CTRL] Одне нанесення 80шт",
      items: [{ productId: product.id, sizeQuantities: sizesFor(product, qty) }],
    });
    const r5 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers5 });
    await addOrderItemDecorationWithRates({
      orderItemId: items[0]!.id,
      nameUk: decorationFormatLineName(f5.nameUk),
      setupCost: 500,
      unitRate: r5,
      decorationFormatId: f5.id,
    });
    const item = await reloadItem(items[0]!.id);
    const calc = buildCalcFromOrderItem(item, pricing);
    const expected = 500 + 35 * 80; // 3300
    log(
      assertClose(Number(calc.decorationsSubtotal), expected),
      "D single+setup",
      `№${order.number}: ${calc.decorationsSubtotal} (очікувано ${expected})`,
    );
  }

  const left = await prisma.order.count();
  const failed = report.filter((r) => !r.ok);
  console.log("\n========== CONTROL REPORT ==========");
  console.log(`checks: ${report.length} | OK: ${report.length - failed.length} | FAIL: ${failed.length}`);
  console.log(`orders left in DB: ${left}`);
  if (failed.length) {
    for (const row of failed) console.log(`  FAIL ${row.name}: ${row.detail}`);
    process.exit(1);
  }
  console.log("Усі контрольні перевірки пройдено.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
