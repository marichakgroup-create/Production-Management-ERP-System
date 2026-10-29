export type CorridorKey =
  | "compose"
  | "sizes"
  | "saveVersion"
  | "approve"
  | "artwork"
  | "handover"
  | "spec"
  | "closed"
  | "cancelled";

export type CorridorTab = "configuration" | "calculation" | "versions" | "files";

/** Line-level need — sizes are NOT here: layout is only before production. */
export type ItemNeed = "qty" | "compose" | "saveVersion" | "approve" | "ready";

export type CorridorStep = {
  key: CorridorKey;
  /** 1-based index in the live corridor. */
  index: number;
  of: number;
  label: string;
  title: string;
  detail: string;
  tab: CorridorTab;
  hrefQuery?: string;
  focusItemId?: string;
  quotationReady: boolean;
  specificationReady: boolean;
};

export type CorridorItemFacts = {
  id: string;
  nameUk: string;
  totalQuantity: number;
  materialsCount: number;
  operationsCount: number;
  decorationsCount: number;
  versionCount: number;
  hasApprovedVersion: boolean;
  specificationLocked: boolean;
  inLatestProposal?: boolean;
  needsSizeBreakdown?: boolean;
};

export type CorridorFacts = {
  status: string;
  deadline: Date | string | null;
  filesCount: number;
  /** True when decoration artwork requirements are satisfied (see orderArtworkReady). */
  artworkReady?: boolean;
  items: CorridorItemFacts[];
  hasCompleteProposal?: boolean;
  hasApprovedProposal?: boolean;
  /** False while any line still has orientative ONE tirage / missing real sizes. */
  sizesReady?: boolean;
};

/**
 * Збір → Розрахунок → Погодження → (розміри) → Виробництво
 * Size layout is only required after approve, before handover.
 */
const LIVE_STEPS = 5;

export const itemNeedLabel: Record<ItemNeed, string> = {
  qty: "Вкажіть кількість",
  compose: "Зберіть склад",
  saveVersion: "Збережіть пропозицію",
  approve: "Погодьте пропозицію",
  ready: "Погоджено",
};

export function itemNeed(
  item: CorridorItemFacts,
  order?: Pick<CorridorFacts, "hasCompleteProposal" | "hasApprovedProposal">,
): ItemNeed {
  if (item.totalQuantity <= 0) return "qty";
  if (item.materialsCount <= 0 || item.operationsCount <= 0) return "compose";
  if (order && !order.hasCompleteProposal) return "saveVersion";
  if (order && order.hasCompleteProposal && !order.hasApprovedProposal) return "approve";
  if (!item.hasApprovedVersion) return "approve";
  return "ready";
}

export function itemNeedTone(
  need: ItemNeed,
): "neutral" | "accent" | "success" | "warning" | "info" {
  if (need === "ready") return "success";
  if (need === "approve") return "warning";
  if (need === "saveVersion") return "info";
  return "accent";
}

function firstBlocking(
  items: CorridorItemFacts[],
  order?: Pick<CorridorFacts, "hasCompleteProposal" | "hasApprovedProposal">,
) {
  return items.find((item) => itemNeed(item, order) !== "ready") ?? null;
}

function named(item: CorridorItemFacts | null, many: boolean, fallback: string) {
  if (!item || !many) return fallback;
  return `${item.nameUk}: ${fallback.charAt(0).toLowerCase()}${fallback.slice(1)}`;
}

function factsOf(
  items: CorridorItemFacts[],
  order?: Pick<CorridorFacts, "hasCompleteProposal" | "hasApprovedProposal">,
) {
  const blocking = firstBlocking(items, order);
  const approved =
    order?.hasApprovedProposal ??
    (items.length > 0 && items.every((item) => item.hasApprovedVersion));
  const specLocked = items.some((item) => item.specificationLocked);
  const needsDecorationFile = items.some((item) => item.decorationsCount > 0);
  return { blocking, approved, specLocked, needsDecorationFile, many: items.length > 1 };
}

/**
 * One next door for an order. Completeness is across every line.
 */
export function corridorFor(input: CorridorFacts): CorridorStep {
  const orderFlags = {
    hasCompleteProposal: input.hasCompleteProposal,
    hasApprovedProposal: input.hasApprovedProposal,
  };
  const { blocking, approved, specLocked, needsDecorationFile, many } = factsOf(
    input.items,
    orderFlags,
  );
  // КП is live from current order composition until production freeze.
  const quotationReady = input.items.some((item) => item.totalQuantity > 0);
  const specificationReady = specLocked || quotationReady;
  const focusItemId = blocking?.id;

  if (input.status === "CANCELLED") {
    return {
      key: "cancelled",
      index: 0,
      of: LIVE_STEPS,
      label: "Відкрити",
      title: "Замовлення скасовано",
      detail: "Подальших кроків немає.",
      tab: "configuration",
      quotationReady,
      specificationReady,
    };
  }

  if (input.status === "CLOSED") {
    return {
      key: "closed",
      index: LIVE_STEPS,
      of: LIVE_STEPS,
      label: specificationReady ? "Специфікація" : "Документи",
      title: "Замовлення закрито",
      detail: "Склад і ціна збережені в історії.",
      tab: "files",
      quotationReady,
      specificationReady,
    };
  }

  if (input.items.length === 0) {
    if (input.status === "DRAFT") {
      return {
        key: "compose",
        index: 1,
        of: LIVE_STEPS,
        label: "Збір",
        title: "Збір замовлення",
        detail:
          "Додайте хоча б один виріб з каталогу. Порожнє замовлення можна лишати лише на чернетці або розрахунку.",
        tab: "configuration",
        quotationReady: false,
        specificationReady: false,
      };
    }
    if (input.status === "CALCULATION") {
      return {
        key: "saveVersion",
        index: 2,
        of: LIVE_STEPS,
        label: "Розрахунок",
        title: "Розрахунок і пропозиція",
        detail:
          "Додайте виріб і збережіть пропозицію. Без позицій далі по етапах замовлення не передається.",
        tab: "configuration",
        quotationReady: false,
        specificationReady: false,
      };
    }
    return {
      key: "compose",
      index: 1,
      of: LIVE_STEPS,
      label: "Збір",
      title: "Потрібна хоча б одна позиція",
      detail:
        "У замовленні немає виробів. Додайте позицію — порожні замовлення не проходять наступні етапи.",
      tab: "configuration",
      quotationReady: false,
      specificationReady: false,
    };
  }

  const need = blocking ? itemNeed(blocking, orderFlags) : "ready";

  if (need === "qty") {
    return {
      key: "compose",
      index: 1,
      of: LIVE_STEPS,
      label: "Вказати кількість",
      title: "Збір · тираж",
      detail: named(
        blocking,
        many,
        "Вкажіть кількість (орієнтовний тираж). Розкладку по розмірах зробите перед виробництвом.",
      ),
      tab: "configuration",
      focusItemId,
      quotationReady,
      specificationReady,
    };
  }

  if (need === "compose") {
    return {
      key: "compose",
      index: 1,
      of: LIVE_STEPS,
      label: "Збір",
      title: "Збір замовлення",
      detail: named(
        blocking,
        many,
        "Додайте матеріали й операції. Далі менеджер передає замовлення на розрахунок.",
      ),
      tab: "configuration",
      focusItemId,
      quotationReady,
      specificationReady,
    };
  }

  if (need === "saveVersion") {
    return {
      key: "saveVersion",
      index: 2,
      of: LIVE_STEPS,
      label: "Розрахунок",
      title: "Розрахунок і пропозиція",
      detail: many
        ? "Порахуйте собівартість і збережіть пропозицію по всіх позиціях. КП завжди з поточного складу. Розкладку розмірів — перед цехом."
        : "Порахуйте собівартість і збережіть пропозицію. КП оновлюється з поточним складом; фіксується при передачі у виробництво.",
      tab: "versions",
      hrefQuery: "action=save",
      focusItemId,
      quotationReady,
      specificationReady,
    };
  }

  if (need === "approve") {
    return {
      key: "approve",
      index: 3,
      of: LIVE_STEPS,
      label: "Погодження",
      title: "Погодьте пропозицію",
      detail: many
        ? "Пропозицію збережено. Погодьте її цілком — далі розкладка розмірів і передача в цех."
        : "Пропозицію збережено. Погодьте ціну — далі розкладка розмірів перед виробництвом.",
      tab: "versions",
      focusItemId,
      quotationReady: true,
      specificationReady,
    };
  }

  if (input.status !== "HANDED_TO_PRODUCTION") {
    if (input.sizesReady === false) {
      const sizesFocus =
        input.items.find((item) => item.needsSizeBreakdown)?.id ?? focusItemId;
      return {
        key: "sizes",
        index: 4,
        of: LIVE_STEPS,
        label: "Розкласти розміри",
        title: "Розміри перед виробництвом",
        detail: many
          ? "Перед передачею в цех розкладіть тираж по реальних розмірах для кожної позиції. 3XL+ підвищать витрати в специфікації."
          : "Перед передачею в цех розкладіть тираж по реальних розмірах. Розміри понад XXL дають вищі витрати.",
        tab: "configuration",
        focusItemId: sizesFocus,
        quotationReady: true,
        specificationReady,
      };
    }

    const artworkMissing =
      needsDecorationFile && input.artworkReady === false
        ? true
        : needsDecorationFile &&
          input.artworkReady == null &&
          input.filesCount === 0;
    if (artworkMissing) {
      return {
        key: "artwork",
        index: 4,
        of: LIVE_STEPS,
        label: "Додати макет",
        title: "Потрібен файл нанесення",
        detail:
          "У складі є друк або вишивка. Додайте макет у вкладці «Документи» для кожної позиції з нанесенням — без нього цех не зможе виконати роботу.",
        tab: "files",
        quotationReady: true,
        specificationReady,
      };
    }

    const missing: string[] = [];
    if (!input.deadline) missing.push("дедлайн");
    return {
      key: "handover",
      index: 4,
      of: LIVE_STEPS,
      label: "Виробництво",
      title: missing.length ? "Ще не все для цеху" : "Передати у виробництво",
      detail: missing.length
        ? `Погоджено й розміри готові. Перед передачею вкажіть: ${missing.join(", ")}.`
        : many
          ? "Усе готово. Натисніть «Передати у виробництво» — специфікація зафіксується."
          : "Натисніть «Передати у виробництво» — специфікація зафіксується.",
      tab: "versions",
      quotationReady: true,
      specificationReady,
    };
  }

  return {
    key: "spec",
    index: 5,
    of: LIVE_STEPS,
    label: "У виробництві",
    title: "У виробництві",
    detail: "Специфікацію зафіксовано. Цех працює за погодженою пропозицією.",
    tab: "files",
    quotationReady: true,
    specificationReady: true,
  };
}

export function corridorHref(orderId: string, step: CorridorStep, itemId?: string) {
  const params = new URLSearchParams();
  params.set("tab", step.tab);
  if (step.hrefQuery) {
    const extra = new URLSearchParams(step.hrefQuery);
    extra.forEach((value, key) => params.set(key, value));
  }
  const focus = itemId || step.focusItemId;
  if (focus) params.set("item", focus);
  return `/orders/${orderId}?${params.toString()}`;
}
