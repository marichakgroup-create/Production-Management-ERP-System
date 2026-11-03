# Order header: audit and ERP UI rules

Reading this as: production order object for a manager at a desk, in the existing calm green ERP, dial ENERGY 1 / RHYTHM 1 / MOTION 1.

The screen's job is to name the order, show who sells and who buys, edit the few terms that belong here, and take the next production step. It is not a landing page and not a dashboard of equal cards.

Visual identity stays the green tokens in `src/app/globals.css`. Do not import the generated master palette, Lora, or a marketing hero.

## Audit

### 1. Design-system problems

- Spacing in the header is a mix of 8, 10, 12, 14 and 16px with no named step.
- Fact hints use `--color-text-quiet` (`#78828e` on white = 3.90:1). That fails 4.5:1 for 12px text.
- Hairline borders (`#e6eaee`, `#d0d6dd`) fail the 3:1 non-text bar. They can stay as dividers. Interactive control edges cannot.
- The optional marker is 10.5px, below the type scale.
- Toolbar mixes 32px secondary buttons with a 40px primary.
- Status is said twice: a badge beside the title and a chevron that also paints the current stage.
- The proposal version is said three times: subtitle, sum hint, and an «Активна пропозиція» fact.

### 2. Page-layout problems

- The shell card holds identity, facts, two filled wells, terms, the pipeline, and the comment. Those are four jobs in one box.
- The two gray wells are cards inside the card. They were added to separate the parties, and they create a third surface.
- The company well is short and the customer well is tall, so the pair looks like two mismatched widgets.
- There is no content max-width, and there should not be one. The workspace stays fluid.

### 3. Component problems

- `OrderWorkspaceHeader` still describes a right-hand client column the page no longer uses.
- Party blocks are one-off markup in the order page, so the next object page cannot reuse them.
- `OrderHeaderFacts` only knows a few column counts, so the grid is chosen per page instead of from the number of facts.

### 4. Local one-off problems

- `rounded-[12px]` and `bg-[var(--color-surface-subtle)]` are written on the two party sections only.
- The deadline row has a one-off column template.
- Phone and email sit in the customer block, which is correct, but they were easy to clip when the block was a narrow card.

## Rules for this header

Hierarchy comes from the title, then the fact line, then two named columns, then the terms. A divider separates bands. A section does not get its own card.

### Page grid

12 columns inside the shell. Shell padding stays 16px, 20px from `sm`. Gap between bands is 16px. The workspace is fluid. No 1200px cap.

### Spacing scale

4, 8, 12, 16, 24. Use 8 between a label and its control, 12 between fields in a group, 16 between bands, 24 only before the pipeline, which is a different job.

### Typography scale

Use the existing classes. Do not add a size.

- Order number: `type-page-title`
- Product line: `type-body-secondary`
- Section title: `type-subsection`
- Fact and field label: `type-label` (passes 4.80:1)
- Fact value: 13px, weight 600
- Hint and read-only contact line: `type-body-secondary` (passes 5.95:1), not `type-caption`

### Surface hierarchy

1. App canvas `--color-app-bg`
2. One workspace surface `--color-surface` with the existing hairline and card shadow
3. Controls on that surface

Do not add a filled well inside the surface to create a group.

### Border and radius

- Surface radius: `--radius-surface` (12)
- Control radius: `--radius-control` (8)
- Badge radius: `--radius-badge` (6)
- Dividers may use `--color-divider`
- Control edges use `--color-control-border` (`#8a9098`, 3.22:1 on white). Same cool gray, dark enough to see the field.

### Button hierarchy

One primary: the next pipeline action. Documents are secondary. Same 32px height in this toolbar, gap 8. The primary stays the deep green with white text.

### Form fields

Visible label above the control. Placeholder is an example. Optional marker is 12px, same color as the label's secondary note. Read-only phone and email are text, not a fake field. Header controls are 32px tall.

### Sections

A section title is `type-subsection`. Peer groups (seller and buyer) sit in two columns with a vertical divider from `lg`. On a narrow screen they stack with 16px between them. No icon, no uppercase kicker.

### Tables

Not part of this header. When a table is on the same page it keeps `type-table`, real columns, and no filler rows. Do not restyle it from this pass.

### Status

The badge next to the order number is the current status, and it includes the word, not only a color. The chevron below is the path. Do not add a second status sentence.

### Toolbar

Actions sit on the title row, aligned to the start of the title, wrapping under it when the row is narrow. Primary is last.

## Information that must remain

Order number, status, product, proposal version, manager, sum, quantity, positions, seller company, customer name and link, responsible person, legal details, phone, email, deadline, payment method, document actions, the next pipeline action, the pipeline, the order comment.
