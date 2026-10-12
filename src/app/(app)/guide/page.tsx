import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { PageHeader, Panel } from "@/components/ui/Page";
import { cn } from "@/lib/utils";

type Step = {
  title: string;
  body: string;
  tip?: string;
  href?: string;
  hrefLabel?: string;
};

type Chapter = {
  id: string;
  label: string;
  title: string;
  lead: string;
  steps: Step[];
};

const chapters: Chapter[] = [
  {
    id: "start",
    label: "Старт",
    title: "Підготуйте систему один раз",
    lead: "Спочатку реквізити й правила цін. Потім довідники. Далі — вироби й замовлення. Якщо пропустити довідники, програма не знатиме, з чого складається ціна.",
    steps: [
      {
        title: "Хто що може",
        body: "Адміністратор налаштовує компанію, ціни, довідники й користувачів. Менеджер створює клієнтів і замовлення, рахує й погоджує партії.",
      },
      {
        title: "Заповніть дані компанії",
        body: "Назва, адреса, телефон. Вони потрапляють у комерційну пропозицію та специфікацію для клієнта.",
        tip: "Якщо зміните реквізити пізніше — у вже збережених документах старі дані залишаться. Нові з’являться лише в нових роздруківках.",
        href: "/settings/company",
        hrefLabel: "Відкрити компанію",
      },
      {
        title: "Задайте звичайну націнку",
        body: "Скажіть системі, яку маржу або націнку ви хочете за замовчуванням. Тут же — курс доллара, карго для тканин і чи рахувати собівартість матеріалів без ПДВ чи з ПДВ.",
        href: "/settings/pricing",
        hrefLabel: "Відкрити ціноутворення",
      },
    ],
  },
  {
    id: "catalog",
    label: "Довідники",
    title: "Заведіть тканини, роботу й друк",
    lead: "Довідник — це ваш прайс «на вході». Без нього виріб і замовлення не з чого рахувати.",
    steps: [
      {
        title: "Матеріали й фурнітура",
        body: "Додайте тканини (зазвичай у метрах погонних) і фурнітуру (шт, м, бобіна). Для тканини — склад зі списку, щільність, ціни з ПДВ і без. Фурнітура — звичайна закупівельна ціна й відходи.",
        tip: "У «Ціноутворенні» — курс $, карго і чи йде в собівартість ціна без ПДВ чи з ПДВ. [ТЕСТ] — демо.",
        href: "/settings/resources",
        hrefLabel: "Відкрити матеріали",
      },
      {
        title: "Операції (робота цеху)",
        body: "Мінімум три позиції: Розкрій, Пошив, Пакування. Для кожної — скільки коштує робота на 1 виріб (або як рахувати зі зміни).",
        tip: "На конкретному виробі ставку можна змінити. Для крою зручніше задати таблицю цін за кількістю — див. крок «Скільки коштує крій».",
        href: "/settings/operations",
        hrefLabel: "Відкрити операції",
      },
      {
        title: "Шовкотрафарет (нанесення в замовленні)",
        body: "Прайс за тиражем і кількістю кольорів плюс коефіцієнти (площа > А4, хімічні тканини, одяг замовника). Додається вже в замовленні — не в картці виробу.",
        tip: "У замовленні: оберіть шовкодрук → галочки коефіцієнтів → «Додати» у рядок розрахунку.",
        href: "/settings/applications",
        hrefLabel: "Відкрити нанесення",
      },
    ],
  },
  {
    id: "product",
    label: "Виріб",
    title: "Зберіть шаблон виробу",
    lead: "Виріб — це базова модель-шаблон: типовий склад, крій за тиражем і комерційний прайс. У замовленні під клієнта змінюють тканину, тираж і деталі — без правок каталогу.",
    steps: [
      {
        title: "Створіть виріб",
        body: "Вкажіть назву, за бажанням внутрішній код і розміри (S, M, L…). Збережіть картку.",
        href: "/products",
        hrefLabel: "Створити виріб",
      },
      {
        title: "Додайте склад виробу",
        body: "У картці виробу додайте матеріали (скільки йде на 1 шт), операції й за потреби нанесення. Без тканини в складі програма порахує лише роботу — собівартість буде заниженою.",
        tip: "«Норма» — скільки метрів або штук іде на один виріб. Це не ціна з прайса тканини.",
        href: "/products",
        hrefLabel: "Відкрити вироби",
      },
      {
        title: "Скільки коштує крій при різній кількості",
        body: "У блоці «Крій за тиражем» заповніть таблицю: при 10 шт — одна ціна крою за річ, при 50 — інша, при 100 — ще інша. Зазвичай чим більша партія, тим дешевший крій на 1 шт.",
        tip: "«Оптимальний тираж» — кількість, від якої крій уже найдешевший. Приклад: оптимум 100 шт. До 100 — ставка падає. Від 100 і більше — та сама найнижча ціна, далі не дешевшає.",
        href: "/products",
        hrefLabel: "Перейти до виробів",
      },
      {
        title: "Базова модель і комерційний прайс",
        body: "Позначте виріб як «базова модель категорії» і заповніть таблицю цін за тиражем — це фіксований прайс для клієнта в КП. Собівартість (матеріали + робота) система рахує окремо для вашого планування.",
        tip: "У каталозі зберігаються базові моделі. Конкретну тканину, тираж і правки складу роблять уже в замовленні — каталог не змінюється.",
        href: "/products",
        hrefLabel: "Відкрити вироби",
      },
    ],
  },
  {
    id: "order",
    label: "Замовлення",
    title: "Від заявки до цеху",
    lead: "Шлях короткий: клієнт → замовлення → перевірка складу → зберегти ціну → погодити → (файли макетів) → передати в цех.",
    steps: [
      {
        title: "Заведіть клієнта",
        body: "Назва компанії й контакт. Без клієнта нове замовлення не створити.",
        href: "/clients",
        hrefLabel: "Відкрити клієнтів",
      },
      {
        title: "Створіть замовлення",
        body: "Оберіть клієнта, додайте виріб з каталогу (або зберіть склад прямо в замовленні). Вкажіть розміри й кількість.",
        href: "/orders/new",
        hrefLabel: "Нове замовлення",
      },
      {
        title: "Перевірте склад позиції",
        body: "На вкладці конфігурації подивіться матеріали, роботу й нанесення. Можна підправити норми лише для цього замовлення — каталог виробу не зміниться.",
      },
      {
        title: "Збережіть розрахунок",
        body: "На вкладці «Пропозиції» збережіть пропозицію для клієнта — таблиця всіх позицій з цінами та сумою замовлення. За потреби сформуйте комерційну пропозицію (КП).",
        tip: "Збережена пропозиція «заморожує» цифри. Якщо потім зміните ціну тканини в довіднику — стара пропозиція не зміниться.",
      },
      {
        title: "Погодьте ціну",
        body: "Погодьте пропозицію цілком — усі позиції та суму замовлення. Адмін може погодити навіть якщо маржа нижча за мінімум. Статус стане «Погоджено».",
      },
      {
        title: "Додайте макети (якщо є друк)",
        body: "Якщо в позиції є нанесення — завантажте файли на вкладці файлів перед передачею в цех.",
      },
      {
        title: "Передайте в цех",
        body: "Коли все погоджено — натисніть передачу у виробництво. Склад і ціна для клієнта більше не правляться в звичайному режимі. Коли партію відвантажено — закрийте замовлення.",
        href: "/orders",
        hrefLabel: "Відкрити замовлення",
      },
    ],
  },
];

function GuideButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "mt-3 inline-flex h-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[12.5px] font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-subtle)]",
      )}
    >
      {children}
    </Link>
  );
}

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-tint-sage)] text-[12px] font-semibold text-[var(--color-primary-700)] tabular"
        aria-hidden
      >
        {index}
      </span>
      <div className="min-w-0 flex-1 pb-5">
        <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">{step.title}</div>
        <p className="type-body-secondary mt-1 text-[13.5px] leading-relaxed">{step.body}</p>
        {step.tip ? (
          <p className="mt-2 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
            {step.tip}
          </p>
        ) : null}
        {step.href ? <GuideButton href={step.href}>{step.hrefLabel ?? "Відкрити"}</GuideButton> : null}
      </div>
    </li>
  );
}

export default async function GuidePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Інструкція"
        description="Простими словами: як завести каталог, зібрати виріб і провести замовлення до цеху. Для власника й менеджера."
      />

      <nav
        aria-label="Розділи"
        className="mb-6 flex flex-wrap gap-1.5 border-b border-[var(--color-border)] pb-3"
      >
        {chapters.map((chapter) => (
          <a
            key={chapter.id}
            href={`#${chapter.id}`}
            className="rounded-[var(--radius-badge)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          >
            {chapter.label}
          </a>
        ))}
      </nav>

      <div className="space-y-5">
        {chapters.map((chapter) => (
          <Panel key={chapter.id} className="overflow-hidden">
            <div
              id={chapter.id}
              className="scroll-mt-20 border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-4"
            >
              <div className="text-[11px] font-bold tracking-[0.08em] text-[var(--color-text-tertiary)] uppercase">
                {chapter.label}
              </div>
              <h2
                className="mt-1 text-[17px] font-semibold tracking-tight text-[var(--color-text-primary)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {chapter.title}
              </h2>
              <p className="type-body-secondary mt-1.5 max-w-xl text-[13.5px] leading-relaxed">
                {chapter.lead}
              </p>
            </div>
            <ol className="px-5 pt-4">
              {chapter.steps.map((step, index) => (
                <StepCard key={step.title} step={step} index={index + 1} />
              ))}
            </ol>
          </Panel>
        ))}
      </div>

      <p className="type-caption mt-6 mb-2 max-w-xl leading-relaxed">
        Позначка [ТЕСТ] означає демо-запис (старі приклади). Усе з ваших файлів CRM — робочий
        каталог, без цієї позначки.
      </p>
    </div>
  );
}
