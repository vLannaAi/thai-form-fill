# @lanna/form-50bis

Embeddable **Vue 3** component for the Thai **50 Bis** withholding-tax certificate
(หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ). Drop it into a host app for
**interactive editing**; the host owns the data and persistence.

The component is **chromeless** (no built-in toolbar) and **self-contained**: the
layout, bilingual strings, fonts (slashed-zero JetBrains Mono + Sarabun), checkbox
image and background are all baked into the bundle — no GitHub token, no network,
no IndexedDB, no Studio editor.

## Install

```bash
npm install @lanna/form-50bis vue
```

`vue` (^3.4) is a peer dependency.

## Usage

```vue
<script setup>
import { ref } from 'vue';
import { Form50Bis } from '@lanna/form-50bis';
import type { Form50BisInput } from '@lanna/form-50bis';

const form = ref();
const data = ref<Form50BisInput>({
  payer: { taxId: '0105556012345', name: 'Lanna Tech Co., Ltd.', address: '123 Sukhumvit Rd., Bangkok 10110' },
  payee: { taxId: '1100987654321', name: 'Mr. Somchai Jaidee', address: '456 Moo 7, Chiang Mai 50200' },
  withholdingReturn: { formType: 'pnd1a', sequenceNumber: '1' },
  income: [{ datePaid: '31 Dec 2026', amountPaid: 600000, taxWithheld: 30000 }],
  taxPaymentCondition: { condition: 'withheldFromPayment' },
  issueDate: { day: '31', month: 'December', yearBE: '2569' },
});
</script>

<template>
  <Form50Bis ref="form" v-model="data" language="en" />
  <button @click="form.print()">Print</button>
</template>
```

The data shape is the JSON Schema in `docs/50bis-input.schema.json`; `Form50BisInput`
is the TypeScript type. Computed totals (amount, tax, amount-in-words) are derived by
the form and are **not** part of the input — read them from the `change` event or
`getResult()`.

## Props

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `modelValue` (`v-model`) | `Form50BisInput` | `{}` | The certificate data. |
| `language` | `'th' \| 'en'` | `'th'` | Form language. |
| `signature` | `string` (data URL) | `''` | Optional signature image. |
| `stamp` | `string` (data URL) | `''` | Optional company-seal image. |
| `showFieldOutlines` | `boolean` | `false` | Tints the fillable fields (debug aid). |

## Events

| Event | Payload | When |
|-------|---------|------|
| `update:modelValue` | `Form50BisInput` | On edit (debounced ~300 ms). |
| `change` | `{ data, totals }` | On edit; `totals = { amountPaid, taxWithheld, taxInWords }` (computed strings). |

## Exposed methods (via `ref`)

| Method | Returns | Notes |
|--------|---------|-------|
| `print()` | — | Prints **only** the certificate, via an off-screen iframe — isolated from host page chrome and host print CSS. |
| `getResult()` | `{ data, totals }` | Synchronous snapshot. |
| `setLanguage(lang)` | — | Same as the `language` prop. |

## Sizing

The certificate renders at a **fixed intrinsic pixel canvas** (it's a pixel-positioned
overlay on a background image — roughly A4 at ~860 × 1190 px). To fit it into a host
layout, wrap it and scale with a CSS transform:

```css
.form-frame { width: 645px; height: 893px; overflow: hidden; }   /* 0.75 of intrinsic */
.form-frame > .tff-50bis { transform: scale(0.75); transform-origin: top left; }
```

All of the component's CSS is scoped under `.tff-50bis`, so it neither leaks into nor
is disturbed by the host's styles.

## Limitations

- **Single instance per page (v1).** The underlying engine uses module-level state, so
  rendering two `<Form50Bis>` on the same page at once is not supported yet. Mount/unmount
  of a single instance is fine.
- Read-only/display mode is not a separate mode in v1 (the component is always editable).

## Building from source

```bash
npm install
npm run build      # runs scripts/build-assets.cjs (bakes scoped CSS + markup + assets), then vite build
npm test           # schemaAdapter round-trip unit tests
```

`scripts/build-assets.cjs` regenerates `src/generated/` from the canonical form in
`../../public/forms/50bis/` (and the shared engine in `../../public/lib/`). Re-run it
after changing the form, its layout, strings, or styles.
