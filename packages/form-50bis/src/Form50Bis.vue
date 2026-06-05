<template>
  <div ref="rootEl" class="tff-50bis"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { toFields, toData } from './schemaAdapter.js';
import { printIsolated } from './print.js';
import { MARKUP } from './generated/markup.js';
import layout from './generated/layout.json';
import strings from './generated/strings.json';
import bgUrl from './generated/assets/background.svg?url';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  language: { type: String, default: 'th' },        // 'th' | 'en'
  signature: { type: String, default: '' },          // data URL
  stamp: { type: String, default: '' },              // data URL
  showFieldOutlines: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'change']);

const rootEl = ref(null);
let FE = null;          // window.FormEngine (loaded lazily so libs attach first)
let debounce = null;
let suppress = false;   // ignore self-induced modelValue echoes

function totals(f) {
  return { amountPaid: f['totals.amountPaid'] || '', taxWithheld: f['totals.taxWithheld'] || '', taxInWords: f['totals.taxInWords'] || '' };
}
function setSlot(slot, src) {
  const img = rootEl.value && rootEl.value.querySelector('img.slot[data-slot="' + slot + '"]');
  if (!img) return; img.src = src || ''; img.style.display = src ? '' : 'none';
}

onMounted(async () => {
  rootEl.value.innerHTML = MARKUP;
  const bf = rootEl.value.querySelector('img.bf'); if (bf) bf.src = bgUrl;
  rootEl.value.classList.toggle('show-fields', props.showFieldOutlines);
  ({ FormEngine: FE } = await import('./engine-bundle.js'));
  FE.init({
    root: rootEl.value, embedded: true, formId: '50bis',
    layout, strings, lang: props.language,
    data: toFields(props.modelValue),
    onChange(fields) {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const data = toData(fields);
        suppress = true; // the v-model echo this emit triggers must not re-restore the fields
        emit('update:modelValue', data);
        emit('change', { data, totals: totals(fields) });
      }, 300);
    },
  });
  setSlot('signature', props.signature);
  setSlot('stamp', props.stamp);
});

watch(() => props.modelValue, (v) => {
  if (!FE) return;
  if (suppress) { suppress = false; return; } // consume the echo from our own emit
  FE._restore(toFields(v)); FE._formatMoneyAll(); FE._recompute();
}, { deep: true });
watch(() => props.language, (l) => { if (FE) FE._setLang(l); });
watch(() => props.showFieldOutlines, (b) => { rootEl.value && rootEl.value.classList.toggle('show-fields', b); });
watch(() => props.signature, (s) => setSlot('signature', s));
watch(() => props.stamp, (s) => setSlot('stamp', s));

onBeforeUnmount(() => { clearTimeout(debounce); if (FE) FE._destroy(); });

defineExpose({
  print() { printIsolated(rootEl.value); },
  getResult() { const f = FE ? FE._collect() : {}; return { data: toData(f), totals: totals(f) }; },
  setLanguage(l) { if (FE) FE._setLang(l); },
});
</script>
