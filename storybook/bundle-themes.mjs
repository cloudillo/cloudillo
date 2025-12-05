import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { createRequire } from 'module'

// Ensure .cache directory exists
mkdirSync('.cache', { recursive: true })

// Determine theme path: prefer local, fallback to npm package
const localPath = '../local/opalui/themes'
let themePath

if (existsSync(localPath)) {
	themePath = localPath
} else {
	const require = createRequire(import.meta.url)
	const opaluiPath = require.resolve('@symbion/opalui')
	themePath = opaluiPath.replace(/\/dist\/.*$/, '/themes')
}

console.log(`Using themes from: ${themePath}`)

// Read theme CSS files
const glassCSS = readFileSync(`${themePath}/glass.css`, 'utf-8')
const opaqueCSS = readFileSync(`${themePath}/opaque.css`, 'utf-8')

// Read background images as base64
const bgLight = readFileSync(`${themePath}/bg.jpg`)
const bgDark = readFileSync(`${themePath}/bg-dark.jpg`)

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

console.log('Themes bundled successfully')
console.log(`- Glass CSS: ${glassCSS.length} bytes`)
console.log(`- Opaque CSS: ${opaqueCSS.length} bytes`)
console.log(`- Background images: ${bgLight.length + bgDark.length} bytes`)
console.log(`- Total output: ${themesContent.length} bytes`)
