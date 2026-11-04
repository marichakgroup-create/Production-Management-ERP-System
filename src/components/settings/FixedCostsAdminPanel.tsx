"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useAppDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { FormGroup } from "@/components/ui/Field";
import { IconArchive, IconTrash } from "@/components/ui/Icons";
import {
  Table,
  TableCard,
  TableEmpty,
  TableToolbar,
  TBody,
  TD,
  TFoot,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import {
  deleteFixedCostArticleAction,
  setFixedCostArticleActiveAction,
  updateFixedCostSettingsAction,
  upsertFixedCostArticleAction,
} from "@/server/domains/fixed-costs/actions";
import { formatMoneyUah, cn } from "@/lib/utils";
import type { FixedCostMetrics } from "@/lib/fixed-costs";

type Article = {
  id: string;
  nameUk: string;
  monthlyAmount: number;
  isActive: boolean;
};

const cellInputClass =
  "h-8 w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[13px] text-[var(--color-text-primary)] outline-none tabular transition-colors placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary-500)] focus:ring-1 focus:ring-[var(--color-primary-100)] disabled:bg-[var(--color-surface-subtle)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function ArticleEditRow({
  article,
  pending,
  onSave,
  onToggleActive,
  onDelete,
}: {
  article: Article;
  pending: boolean;
  onSave: (next: { id: string; nameUk: string; monthlyAmount: number; isActive: boolean }) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(article.nameUk);
  const [amount, setAmount] = useState(String(article.monthlyAmount));

  useEffect(() => {
    setName(article.nameUk);
    setAmount(String(article.monthlyAmount));
  }, [article.id, article.nameUk, article.monthlyAmount]);

  function commit() {
    const trimmed = name.trim();
    const value = Number(amount.replace(",", "."));
    if (!trimmed || !Number.isFinite(value) || value < 0) {
      setName(article.nameUk);
      setAmount(String(article.monthlyAmount));
      return;
    }
    if (trimmed === article.nameUk && value === article.monthlyAmount) return;
    onSave({
      id: article.id,
      nameUk: trimmed,
      monthlyAmount: value,
      isActive: article.isActive,
    });
  }

  return (
    <TR muted={!article.isActive}>
      <TD className="py-1.5">
        <input
          type="text"
          disabled={pending}
          className={cn(cellInputClass, !article.isActive && "line-through opacity-70")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          aria-label="Назва статті"
        />
      </TD>
      <TD className="py-1.5" numeric>
        <input
          type="number"
          min={0}
          step="0.01"
          disabled={pending}
          className={cn(cellInputClass, "text-right")}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          aria-label="Сума на місяць"
        />
      </TD>
      <TD align="right" className="py-1.5" nowrap>
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            disabled={pending}
            title={article.isActive ? "В архів" : "Активувати"}
            aria-label={article.isActive ? "В архів" : "Активувати"}
            onClick={onToggleActive}
            className="rounded-[var(--radius-control)] p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            <IconArchive size={15} />
          </button>
          <button
            type="button"
            disabled={pending}
            title="Видалити"
            aria-label={`Видалити ${article.nameUk}`}
            onClick={onDelete}
            className="rounded-[var(--radius-control)] p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:opacity-50"
          >
            <IconTrash size={15} />
          </button>
        </div>
      </TD>
    </TR>
  );
}

export function FixedCostsAdminPanel({
  settings,
  articles,
  monthlyTotalActive,
  metrics,
}: {
  settings: {
    workingDaysPerMonth: number;
    sewerCount: number;
    dailySewerPay: number;
  };
  articles: Article[];
  monthlyTotalActive: number;
  metrics: FixedCostMetrics | null;
}) {
  const router = useRouter();
  const dialog = useAppDialog();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const activeCount = articles.filter((row) => row.isActive).length;

  function run(action: () => Promise<{ ok: boolean }>, failMessage: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(failMessage);
        return;
      }
      router.refresh();
    });
  }

  function saveArticle(next: {
    id?: string;
    nameUk: string;
    monthlyAmount: number;
    isActive?: boolean;
  }) {
    const formData = new FormData();
    if (next.id) formData.set("id", next.id);
    formData.set("nameUk", next.nameUk);
    formData.set("monthlyAmount", String(next.monthlyAmount));
    formData.set("isActive", next.isActive === false ? "0" : "1");
    run(() => upsertFixedCostArticleAction(formData), "Перевірте назву та суму статті.");
  }

  return (
    <div className="space-y-4">
      {dialog.view}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div className="grid gap-2 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-3 sm:grid-cols-4">
        <Metric
          label="ПВ / міс"
          value={formatMoneyUah(monthlyTotalActive)}
        />
        <Metric label="ПВ / день" value={metrics ? formatMoneyUah(metrics.perDay) : "—"} />
        <Metric
          label="ПВ на швачку / день"
          value={metrics ? formatMoneyUah(metrics.perSewerPerDay) : "—"}
        />
        <Metric
          label="Коефіцієнт"
          value={metrics ? metrics.coefficient.toFixed(1) : "—"}
          emphasize
        />
      </div>
      <p className="type-caption -mt-2 px-0.5">
        ПВ/од. = пошиття ÷ коефіцієнт. Окремий рядок у собівартості, не операція.
      </p>

      <TableCard>
        <TableToolbar
          left={
            <div>
              <span className="type-subsection">Параметри цеху</span>
              <p className="type-caption mt-0.5">
                Швачок можна перевизначити в замовленні.
              </p>
            </div>
          }
        />
        <form
          className="grid gap-3 px-3.5 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            run(
              () => updateFixedCostSettingsAction(formData),
              "Перевірте робочі дні, кількість швачок і денну оплату (усі > 0).",
            );
          }}
        >
          <FormGroup label="Робочих днів / міс">
            <Input
              name="workingDaysPerMonth"
              type="number"
              min={1}
              defaultValue={settings.workingDaysPerMonth}
              required
              inputClassName="h-9 text-[13px]"
            />
          </FormGroup>
          <FormGroup label="Кількість швачок">
            <Input
              name="sewerCount"
              type="number"
              min={1}
              defaultValue={settings.sewerCount}
              required
              inputClassName="h-9 text-[13px]"
            />
          </FormGroup>
          <FormGroup label="Денна оплата швачки, ₴">
            <Input
              name="dailySewerPay"
              type="number"
              min={0.01}
              step="0.01"
              defaultValue={settings.dailySewerPay}
              required
              inputClassName="h-9 text-[13px]"
            />
          </FormGroup>
          <Button type="submit" size="sm" loading={pending} className="sm:mb-0.5">
            Зберегти
          </Button>
        </form>
      </TableCard>

      <TableCard>
        <TableToolbar
          left={
            <span className="type-subsection">
              Статті
              <span className="type-caption ml-1.5 font-normal">
                {activeCount} активн. · {articles.length} усього
              </span>
            </span>
          }
          right={
            <span className="type-caption">Зміни зберігаються після виходу з поля</span>
          }
        />
        <Table>
          <THead>
            <TH>Назва</TH>
            <TH align="right" width="140px">
              ₴ / міс
            </TH>
            <TH align="right" width="88px" />
          </THead>
          <TBody>
            {articles.length === 0 ? (
              <TableEmpty
                colSpan={3}
                title="Порожньо"
                description="Додайте першу статтю в рядку нижче."
              />
            ) : (
              articles.map((row) => (
                <ArticleEditRow
                  key={row.id}
                  article={row}
                  pending={pending}
                  onSave={saveArticle}
                  onToggleActive={() => {
                    const formData = new FormData();
                    formData.set("id", row.id);
                    formData.set("isActive", row.isActive ? "0" : "1");
                    run(
                      () => setFixedCostArticleActiveAction(formData),
                      "Не вдалося змінити статус статті.",
                    );
                  }}
                  onDelete={async () => {
                    const ok = await dialog.ask({
                      title: `Видалити «${row.nameUk}»?`,
                      message: "Статтю витрат буде прибрано.",
                      confirmLabel: "Видалити",
                      danger: true,
                    });
                    if (!ok) return;
                    const formData = new FormData();
                    formData.set("id", row.id);
                    run(
                      () => deleteFixedCostArticleAction(formData),
                      "Не вдалося видалити статтю.",
                    );
                  }}
                />
              ))
            )}
          </TBody>
          {articles.length > 0 ? (
            <TFoot>
              <tr>
                <TD className="text-[var(--color-text-secondary)]">Разом активні</TD>
                <TD numeric className="font-semibold">
                  {formatMoneyUah(monthlyTotalActive)}
                </TD>
                <TD />
              </tr>
            </TFoot>
          ) : null}
        </Table>

        <form
          className="grid grid-cols-[1fr_140px_auto] items-center gap-2 border-t border-[var(--color-border)] px-3 py-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = newName.trim();
            const value = Number(newAmount.replace(",", "."));
            if (!trimmed || !Number.isFinite(value) || value < 0) {
              setError("Перевірте назву та суму статті.");
              return;
            }
            const formData = new FormData();
            formData.set("nameUk", trimmed);
            formData.set("monthlyAmount", String(value));
            formData.set("isActive", "1");
            run(async () => {
              const result = await upsertFixedCostArticleAction(formData);
              if (result.ok) {
                setNewName("");
                setNewAmount("");
              }
              return result;
            }, "Перевірте назву та суму статті.");
          }}
        >
          <input
            type="text"
            className={cellInputClass}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Нова стаття"
            required
            disabled={pending}
            aria-label="Нова стаття"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            className={cn(cellInputClass, "text-right")}
            value={newAmount}
            onChange={(event) => setNewAmount(event.target.value)}
            placeholder="0"
            required
            disabled={pending}
            aria-label="Сума нової статті"
          />
          <Button type="submit" size="sm" loading={pending}>
            Додати
          </Button>
        </form>
      </TableCard>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="type-caption">{label}</div>
      <div
        className={cn(
          "mt-0.5 truncate tabular text-[15px]",
          emphasize
            ? "font-semibold text-[var(--color-text-primary)]"
            : "font-medium text-[var(--color-text-primary)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
