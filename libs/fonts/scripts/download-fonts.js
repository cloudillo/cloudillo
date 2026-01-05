#!/usr/bin/env node
/**
 * Font Download Script
 * Downloads Google Fonts and saves them locally for self-hosting
 *
 * Usage:
 *   node download-fonts.js          # Download missing fonts
 *   node download-fonts.js --force  # Re-download all fonts
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, '..', 'fonts')

// Font definitions - Google Fonts family names and weights to download
const FONT_SPECS = [
	// Sans-serif
	{ family: 'Roboto', weights: [400, 700], italic: true, dir: 'roboto' },
	{ family: 'Open Sans', weights: [400, 700], italic: true, dir: 'open-sans' },
	{ family: 'Montserrat', weights: [400, 700], italic: true, dir: 'montserrat' },
	{ family: 'Lato', weights: [400, 700], italic: true, dir: 'lato' },
	{ family: 'Poppins', weights: [400, 700], italic: true, dir: 'poppins' },
	{ family: 'Inter', weights: [400, 700], italic: true, dir: 'inter' },
	{ family: 'Nunito Sans', weights: [400, 700], italic: true, dir: 'nunito-sans' },
	{ family: 'Work Sans', weights: [400, 700], italic: true, dir: 'work-sans' },
	{ family: 'Raleway', weights: [400, 700], italic: true, dir: 'raleway' },
	{ family: 'DM Sans', weights: [400, 700], italic: true, dir: 'dm-sans' },
	{ family: 'Source Sans 3', weights: [400, 700], italic: true, dir: 'source-sans-3' },

	// Serif
	{ family: 'Playfair Display', weights: [400, 700], italic: true, dir: 'playfair-display' },
	{ family: 'Merriweather', weights: [400, 700], italic: true, dir: 'merriweather' },
	{ family: 'Lora', weights: [400, 700], italic: true, dir: 'lora' },
	{ family: 'Crimson Pro', weights: [400, 700], italic: true, dir: 'crimson-pro' },
	{ family: 'Source Serif 4', weights: [400, 700], italic: true, dir: 'source-serif-4' },
	{ family: 'DM Serif Display', weights: [400], italic: true, dir: 'dm-serif-display' },

	// Display
	{ family: 'Oswald', weights: [400, 700], italic: false, dir: 'oswald' },
	{ family: 'Bebas Neue', weights: [400], italic: false, dir: 'bebas-neue' },
	{ family: 'Abril Fatface', weights: [400], italic: false, dir: 'abril-fatface' },
	{ family: 'Permanent Marker', weights: [400], italic: false, dir: 'permanent-marker' },

	// Monospace
	{ family: 'JetBrains Mono', weights: [400, 700], italic: true, dir: 'jetbrains-mono' }
]

const WEIGHT_NAMES = {
	100: 'Thin',
	200: 'ExtraLight',
	300: 'Light',
	400: 'Regular',
	500: 'Medium',
	600: 'SemiBold',
	700: 'Bold',
	800: 'ExtraBold',
	900: 'Black'
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url, {
				...options,
				headers: {
					// Request woff2 format by using a modern user agent
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					...options.headers
				}
			})
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
			return response
		} catch (error) {
			if (i === retries - 1) throw error
			console.log(`  Retry ${i + 1}/${retries} after error: ${error.message}`)
			await new Promise((r) => setTimeout(r, delay * (i + 1)))
		}
	}
}

/**
 * Parse Google Fonts CSS to extract woff2 URLs
 * Google Fonts returns multiple @font-face for different unicode ranges;
 * we deduplicate by weight+style, preferring latin subset
 */
function parseGoogleFontsCss(css) {
	const fontMap = new Map() // key: "weight-style", value: font data
	const fontFaceRegex = /@font-face\s*\{([^}]+)\}/g
	let match

	while ((match = fontFaceRegex.exec(css)) !== null) {
		const block = match[1]

		const familyMatch = block.match(/font-family:\s*['"]?([^'";\n]+)['"]?/)
		const styleMatch = block.match(/font-style:\s*(\w+)/)
		const weightMatch = block.match(/font-weight:\s*(\d+)/)
		const urlMatch = block.match(/src:\s*url\(([^)]+\.woff2)\)/)
		const rangeMatch = block.match(/unicode-range:\s*([^;]+)/)

		if (familyMatch && urlMatch) {
			const style = styleMatch ? styleMatch[1] : 'normal'
			const weight = weightMatch ? parseInt(weightMatch[1]) : 400
			const key = `${weight}-${style}`
			const isLatin = rangeMatch && rangeMatch[1].includes('U+0000')

			// Prefer latin subset, or keep first match
			if (!fontMap.has(key) || isLatin) {
				fontMap.set(key, {
					family: familyMatch[1],
					style,
					weight,
					url: urlMatch[1]
				})
			}
		}
	}

	return Array.from(fontMap.values())
}

/**
 * Download a single font file
 */
async function downloadFontFile(url, destPath) {
	const response = await fetchWithRetry(url)
	const buffer = await response.arrayBuffer()
	writeFileSync(destPath, Buffer.from(buffer))
}

/**
 * Download all variants for a font family
 */
async function downloadFont(spec) {
	const { family, weights, italic, dir } = spec
	const fontDir = join(FONTS_DIR, dir)

	if (!existsSync(fontDir)) {
		mkdirSync(fontDir, { recursive: true })
	}

	// Build variants - must be sorted by ital,wght for Google Fonts API
	const variants = []
	for (const weight of weights) {
		variants.push(`0,${weight}`) // normal
	}
	if (italic) {
		for (const weight of weights) {
			variants.push(`1,${weight}`) // italic
		}
	}

	const familyParam = `${family.replace(/ /g, '+')}:ital,wght@${variants.join(';')}`
	const cssUrl = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`

	console.log(`Downloading ${family}...`)

	try {
		const response = await fetchWithRetry(cssUrl)
		const css = await response.text()
		const fonts = parseGoogleFontsCss(css)

		if (fonts.length === 0) {
			console.log(`  Warning: No fonts found in CSS for ${family}`)
			return false
		}

		for (const font of fonts) {
			const isItalic = font.style === 'italic'
			const baseName = dir
				.split('-')
				.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
				.join('')
			const weightName = WEIGHT_NAMES[font.weight] || font.weight
			const filename = `${baseName}-${weightName}${isItalic ? 'Italic' : ''}.woff2`
			const destPath = join(fontDir, filename)

			if (!existsSync(destPath)) {
				await downloadFontFile(font.url, destPath)
				console.log(`  Downloaded: ${filename}`)
			} else {
				console.log(`  Exists: ${filename}`)
			}
		}

		return true
	} catch (error) {
		console.error(`  Error downloading ${family}: ${error.message}`)
		return false
	}
}

/**
 * Check if a font directory has all expected files
 */
function isFontComplete(spec) {
	const fontDir = join(FONTS_DIR, spec.dir)
	if (!existsSync(fontDir)) return false

	const files = readdirSync(fontDir)
	const expectedCount = spec.weights.length * (spec.italic ? 2 : 1)
	return files.filter((f) => f.endsWith('.woff2')).length >= expectedCount
}

/**
 * Main download function
 */
async function main() {
	const force = process.argv.includes('--force')

	console.log('Cloudillo Fonts Download Script')
	console.log('================================')
	console.log(`Fonts directory: ${FONTS_DIR}`)
	console.log(`Force re-download: ${force}`)
	console.log('')

	if (!existsSync(FONTS_DIR)) {
		mkdirSync(FONTS_DIR, { recursive: true })
	}

	let downloaded = 0
	let skipped = 0
	let failed = 0

	for (const spec of FONT_SPECS) {
		if (!force && isFontComplete(spec)) {
			console.log(`Skipping ${spec.family} (already downloaded)`)
			skipped++
			continue
		}

		const success = await downloadFont(spec)
		if (success) {
			downloaded++
		} else {
			failed++
		}

		await new Promise((r) => setTimeout(r, 100))
	}

	console.log('')
	console.log('Summary:')
	console.log(`  Downloaded: ${downloaded}`)
	console.log(`  Skipped: ${skipped}`)
	console.log(`  Failed: ${failed}`)

	if (failed > 0) {
		console.log('')
		console.log('Some fonts failed to download. Run again or use --force to retry.')
		process.exit(1)
	}
}

main().catch((error) => {
	console.error('Fatal error:', error)
	process.exit(1)
})
