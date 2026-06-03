import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const formsDir = join(root, 'public', 'forms')
const outDir = join(root, 'app', 'assets', 'data')
const outFile = join(outDir, 'forms.json')

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const forms = readdirSync(formsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => {
    const stringsPath = join(formsDir, d.name, 'strings.json')
    const strings = JSON.parse(readFileSync(stringsPath, 'utf-8'))
    const title = strings.console?.title || { th: d.name, en: d.name }

    // Optional meta.json for description overrides
    const metaPath = join(formsDir, d.name, 'meta.json')
    let meta = {}
    try { meta = JSON.parse(readFileSync(metaPath, 'utf-8')) } catch { /* no meta.json */ }

    return {
      id: d.name,
      titleTh: title.th,
      titleEn: title.en,
      descTh: meta.descTh || '',
      descEn: meta.descEn || '',
    }
  })

writeFileSync(outFile, JSON.stringify(forms, null, 2) + '\n')
console.log(`[build-manifest] wrote ${forms.length} form(s) → app/assets/data/forms.json`)
