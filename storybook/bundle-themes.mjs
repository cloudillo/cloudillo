import { readFileSync, writeFileSync, mkdirSync } from 'fs'

// Ensure .cache directory exists
mkdirSync('.cache', { recursive: true })

// Read theme CSS files
const glassCSS = readFileSync('../local/opalui/themes/glass.css', 'utf-8')
const opaqueCSS = readFileSync('../local/opalui/themes/opaque.css', 'utf-8')

// Read background images as base64
const bgLight = readFileSync('../local/opalui/themes/bg.jpg')
const bgDark = readFileSync('../local/opalui/themes/bg-dark.jpg')

const bgLightBase64 = bgLight.toString('base64')
const bgDarkBase64 = bgDark.toString('base64')

// Replace image URLs with data URLs
let glassProcessed = glassCSS
	.replace('url(bg.jpg)', `url(data:image/jpeg;base64,${bgLightBase64})`)
	.replace('url(bg-dark.jpg)', `url(data:image/jpeg;base64,${bgDarkBase64})`)

// Remove @import statements (fonts will be loaded in HTML)
const glassWithoutImport = glassProcessed.replace(/@import url\([^)]+\);/gm, '').trim()
const opaqueWithoutImport = opaqueCSS.replace(/@import url\([^)]+\);/gm, '').trim()

// Combine into single file without @import
const themesContent = `/* OpalUI Themes - Bundled */\n\n${glassWithoutImport}\n\n${opaqueWithoutImport}\n`

writeFileSync('.cache/themes.css', themesContent)

// Also inject themes into styles.css since esbuild doesn't bundle local @import
const stylesTemplate = `/* Import all CSS dependencies */
@import '@symbion/opalui/dist/opalui.css';
@import '@cloudillo/react/src/components.css';

/* Injected OpalUI Themes */
${themesContent}
`
writeFileSync('.cache/styles.css', stylesTemplate)

console.log('Themes bundled successfully')
console.log(`- Glass CSS: ${glassCSS.length} bytes`)
console.log(`- Opaque CSS: ${opaqueCSS.length} bytes`)
console.log(`- Background images: ${bgLight.length + bgDark.length} bytes`)
console.log(`- Total output: ${themesContent.length} bytes`)
