<script setup lang="ts">
import formsData from '~/assets/data/forms.json'

const { app: { baseURL } } = useRuntimeConfig()

const lang = ref<'th' | 'en'>('th')
const isEn = computed(() => lang.value === 'en')

function formHref(id: string) {
  return `${baseURL}forms/${id}/index.html`
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <header class="bg-[#137333] text-white px-5 py-7">
      <div class="max-w-3xl mx-auto flex items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold m-0">Thai Form Fill</h1>
          <p class="mt-1.5 opacity-90 text-sm leading-relaxed">
            {{
              isEn
                ? 'Fill Thai government forms in your browser. Your data stays on your device.'
                : 'กรอกแบบฟอร์มราชการในเบราว์เซอร์ ข้อมูลเก็บในเครื่องของคุณเท่านั้น'
            }}
          </p>
        </div>
        <button
          class="mt-1 shrink-0 px-3 py-1 rounded text-sm font-medium text-white/90 border border-white/30 hover:bg-white/10 transition-colors cursor-pointer"
          @click="lang = isEn ? 'th' : 'en'"
        >
          {{ isEn ? 'ไทย' : 'EN' }}
        </button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6 space-y-3">
      <a
        v-for="form in formsData"
        :key="form.id"
        :href="formHref(form.id)"
        class="block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-inherit no-underline hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all duration-150"
      >
        <h2 class="text-base font-semibold m-0 mb-1 text-gray-900 dark:text-gray-100">
          {{ isEn ? form.titleEn : form.titleTh }}
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 m-0">
          {{ isEn ? form.descEn : form.descTh }}
        </p>
      </a>
    </main>

    <footer class="max-w-3xl mx-auto px-4 py-4 text-xs text-gray-400">
      Open-source public utility · no accounts · no server · all data local (IndexedDB).
    </footer>
  </div>
</template>
