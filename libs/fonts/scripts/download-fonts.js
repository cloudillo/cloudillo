#!/usr/bin/env node

/**
 * Font Download Script
 * Downloads Google Fonts and converts variable fonts to static fonts:
 * - WOFF2 from Google Fonts API (for browser CSS)
 * - TTF from the full (non-subset) upstream files in github.com/google/fonts, made static using
 *   fonttools. The CSS API woff2 files are latin-only subsets, so they are not used for TTFs.
 *
 * Usage:
 *   node download-fonts.js          # Download missing fonts
 *   node download-fonts.js --force  # Re-download all fonts
 */

import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	unlinkSync,
	writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, '..', 'fonts')
const CONVERT_SCRIPT = join(__dirname, 'convert-to-static.py')

/**
 * Expected sha256 per '<dir>/<File>.ttf', read from the generated `src/font-metrics.ts`. Empty
 * under --force, which regenerates them (`download:force` runs hash-fonts.js afterwards).
 */
const EXPECTED_SHA256 = process.argv.includes('--force') ? {} : readExpectedHashes()

function readExpectedHashes() {
	try {
		const src = readFileSync(join(__dirname, '..', 'src', 'font-metrics.ts'), 'utf-8')
		const re = /'([^']+\.ttf)': \{\s*sha256: '([0-9a-f]{64})'/g
		return Object.fromEntries([...src.matchAll(re)].map(([, file, hash]) => [file, hash]))
	} catch {
		return {}
	}
}

// Font definitions
// All fonts now support PDF embedding via variable→static conversion
const FONT_SPECS = [
	// Sans-serif
	{ family: 'Lato', weights: [400, 700], italic: true, dir: 'lato' },
	{ family: 'Poppins', weights: [400, 700], italic: true, dir: 'poppins' },
	{ family: 'Roboto', weights: [400, 700], italic: true, dir: 'roboto' },
	{ family: 'Open Sans', weights: [400, 700], italic: true, dir: 'open-sans' },
	{ family: 'Montserrat', weights: [400, 700], italic: true, dir: 'montserrat' },
	{ family: 'Inter', weights: [400, 700], italic: true, dir: 'inter' },
	{ family: 'Nunito Sans', weights: [400, 700], italic: true, dir: 'nunito-sans' },
	{ family: 'Work Sans', weights: [400, 700], italic: true, dir: 'work-sans' },
	{ family: 'Raleway', weights: [400, 700], italic: true, dir: 'raleway' },
	{ family: 'DM Sans', weights: [400, 700], italic: true, dir: 'dm-sans' },
	{ family: 'Source Sans 3', weights: [400, 700], italic: true, dir: 'source-sans-3' },
	{ family: 'Noto Sans', weights: [400, 700], italic: true, dir: 'noto-sans' },

	// Serif
	{ family: 'DM Serif Display', weights: [400], italic: true, dir: 'dm-serif-display' },
	{ family: 'Playfair Display', weights: [400, 700], italic: true, dir: 'playfair-display' },
	{ family: 'Merriweather', weights: [400, 700], italic: true, dir: 'merriweather' },
	{ family: 'Lora', weights: [400, 700], italic: true, dir: 'lora' },
	{ family: 'Crimson Pro', weights: [400, 700], italic: true, dir: 'crimson-pro' },
	{ family: 'Source Serif 4', weights: [400, 700], italic: true, dir: 'source-serif-4' },

	// Display
	{ family: 'Bebas Neue', weights: [400], italic: false, dir: 'bebas-neue' },
	{ family: 'Abril Fatface', weights: [400], italic: false, dir: 'abril-fatface' },
	{ family: 'Permanent Marker', weights: [400], italic: false, dir: 'permanent-marker' },
	{ family: 'Oswald', weights: [400, 700], italic: false, dir: 'oswald' },

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

// User agent for Google Fonts API (WOFF2)
const USER_AGENT_WOFF2 =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url, {
				...options,
				headers: {
					'User-Agent': USER_AGENT_WOFF2,
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
 * Parse Google Fonts CSS to extract WOFF2 URLs
 */
function parseGoogleFontsCss(css) {
	const fontMap = new Map()
	const fontFaceRegex = /@font-face\s*\{([^}]+)\}/g
	let match = fontFaceRegex.exec(css)

	while (match) {
		const block = match[1]

		const familyMatch = block.match(/font-family:\s*['"]?([^'";\n]+)['"]?/)
		const styleMatch = block.match(/font-style:\s*(\w+)/)
		const weightMatch = block.match(/font-weight:\s*(\d+)/)
		const urlMatch = block.match(/src:\s*url\(([^)]+\.woff2)\)/)
		const rangeMatch = block.match(/unicode-range:\s*([^;]+)/)

		if (familyMatch && urlMatch) {
			const style = styleMatch ? styleMatch[1] : 'normal'
			const weight = weightMatch ? parseInt(weightMatch[1], 10) : 400
			const key = `${weight}-${style}`
			const isLatin = rangeMatch?.[1].includes('U+0000')

			if (!fontMap.has(key) || isLatin) {
				fontMap.set(key, {
					family: familyMatch[1],
					style,
					weight,
					url: urlMatch[1]
				})
			}
		}
		match = fontFaceRegex.exec(css)
	}

	return Array.from(fontMap.values())
}

/**
 * Get the local filename for a font variant
 */
function getLocalFilename(baseName, weight, isItalic, ext) {
	const weightName = WEIGHT_NAMES[weight] || weight
	return `${baseName}-${weightName}${isItalic ? 'Italic' : ''}.${ext}`
}

// Pinned google/fonts commit: bumping it changes the TTFs, so run `download:force` after.
const UPSTREAM_REV = 'bd8f81ddb5c74d5c8897b36ad88b440266245103'
const UPSTREAM_BASE = `https://raw.githubusercontent.com/google/fonts/${UPSTREAM_REV}`

/**
 * List a family's upstream TTFs from google/fonts METADATA.pb:
 * [{ style: 'normal' | 'italic', weight, url }] (variable files list their default weight)
 */
async function fetchUpstreamFonts(family) {
	const famDir = family.toLowerCase().replace(/ /g, '')
	for (const lic of ['ofl', 'apache', 'ufl']) {
		const res = await fetch(`${UPSTREAM_BASE}/${lic}/${famDir}/METADATA.pb`)
		if (!res.ok) continue
		const pb = await res.text()
		return [...pb.matchAll(/fonts \{([^}]+)\}/g)].map(([, block]) => {
			const filename = block.match(/filename: "([^"]+)"/)[1]
			return {
				style: block.match(/style: "(\w+)"/)[1],
				weight: parseInt(block.match(/weight: (\d+)/)[1], 10),
				variable: filename.includes('['),
				url: `${UPSTREAM_BASE}/${lic}/${famDir}/${encodeURIComponent(filename)}`
			}
		})
	}
	throw new Error(`no upstream METADATA.pb for ${family}`)
}

/**
 * Download a single file
 */
async function downloadFile(url, destPath) {
	const response = await fetchWithRetry(url)
	const buffer = await response.arrayBuffer()
	writeFileSync(destPath, Buffer.from(buffer))
}

/**
 * Check if Python with fonttools is available
 */
function checkPython() {
	try {
		execFileSync('python3', ['-c', 'from fontTools.varLib import instancer'], {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe']
		})
		return true
	} catch {
		return false
	}
}

/**
 * Convert variable TTF to static TTF using Python fonttools
 */
function convertVariableToStatic(inputTTF, outputTTF, weight, isItalic) {
	try {
		const args = [CONVERT_SCRIPT, inputTTF, outputTTF, String(weight)]
		if (isItalic) args.push('italic')

		execFileSync('python3', args, {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe']
		})
		return true
	} catch (error) {
		console.log(`  Python conversion failed: ${error.message}`)
		return false
	}
}

/**
 * Download WOFF2 fonts from Google Fonts API and convert to static TTF
 */
async function downloadAndConvertFonts(spec, hasPython) {
	const { family, weights, italic, dir } = spec
	const fontDir = join(FONTS_DIR, dir)
	const tempDir = join(fontDir, '.temp')

	if (!existsSync(fontDir)) {
		mkdirSync(fontDir, { recursive: true })
	}

	if (!existsSync(tempDir)) {
		mkdirSync(tempDir, { recursive: true })
	}

	// Build variant list for Google Fonts API
	const variants = []
	for (const weight of weights) {
		variants.push(`0,${weight}`)
	}
	if (italic) {
		for (const weight of weights) {
			variants.push(`1,${weight}`)
		}
	}

	const familyParam = `${family.replace(/ /g, '+')}:ital,wght@${variants.join(';')}`
	const cssUrl = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`

	// The CSS API can't be pinned, so the WOFF2 files stay unverified; self-host them from
	// UPSTREAM_REV (woff2 compress) if that matters.
	const response = await fetchWithRetry(cssUrl)
	const css = await response.text()
	const fonts = parseGoogleFontsCss(css)
	let upstream = null

	const baseName = dir
		.split('-')
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join('')

	for (const font of fonts) {
		const isItalic = font.style === 'italic'
		const woff2Filename = getLocalFilename(baseName, font.weight, isItalic, 'woff2')
		const ttfFilename = getLocalFilename(baseName, font.weight, isItalic, 'ttf')
		const woff2Path = join(fontDir, woff2Filename)
		const ttfPath = join(fontDir, ttfFilename)

		// Download WOFF2 if needed
		if (!existsSync(woff2Path)) {
			await downloadFile(font.url, woff2Path)
			console.log(`  Downloaded WOFF2: ${woff2Filename}`)
		}

		// Static TTF from the full upstream file (variable → instanced, static → re-saved)
		if (!existsSync(ttfPath) && hasPython) {
			upstream ??= await fetchUpstreamFonts(family)
			const style = isItalic ? 'italic' : 'normal'
			const src =
				upstream.find(
					(u) => u.style === style && !u.variable && u.weight === font.weight
				) ?? upstream.find((u) => u.style === style && u.variable)
			if (!src) throw new Error(`no upstream TTF for ${family} ${font.weight} ${style}`)

			const tempTTFPath = join(tempDir, `upstream-${ttfFilename}`)
			await downloadFile(src.url, tempTTFPath)
			if (!convertVariableToStatic(tempTTFPath, ttfPath, font.weight, isItalic)) {
				throw new Error(`static conversion failed for ${ttfFilename}`)
			}
			unlinkSync(tempTTFPath)
			const want = EXPECTED_SHA256[`${dir}/${ttfFilename}`]
			const got = createHash('sha256').update(readFileSync(ttfPath)).digest('hex')
			if (want && got !== want) {
				console.warn(
					`  WARNING: sha256 mismatch for ${ttfFilename}: got ${got}, want ${want} ` +
						'(different fonttools version? layout will refuse this face; run ' +
						'`pnpm -C libs/fonts download:force` with the pinned fonttools or re-hash)'
				)
			}
			console.log(`  Created static TTF: ${ttfFilename}`)
		} else if (!existsSync(ttfPath)) {
			console.log(`  Skipping TTF (Python fonttools not available)`)
		}
	}

	// Clean up temp directory if empty
	try {
		const tempFiles = readdirSync(tempDir)
		if (tempFiles.length === 0) {
			rmdirSync(tempDir)
		}
	} catch {
		/* ignore */
	}
}

/**
 * Process a single font family
 */
async function processFont(spec, hasPython) {
	const { family } = spec

	console.log(`Processing ${family}...`)

	try {
		await downloadAndConvertFonts(spec, hasPython)
		return true
	} catch (error) {
		console.error(`  Error processing ${family}: ${error.message}`)
		return false
	}
}

/**
 * Check if a font directory has all expected files
 */
function isFontComplete(spec, requireTTF) {
	const fontDir = join(FONTS_DIR, spec.dir)
	if (!existsSync(fontDir)) return false

	const files = readdirSync(fontDir)
	const expectedCount = spec.weights.length * (spec.italic ? 2 : 1)
	const woff2Count = files.filter((f) => f.endsWith('.woff2')).length
	const ttfCount = files.filter((f) => f.endsWith('.ttf')).length

	if (requireTTF) {
		return woff2Count >= expectedCount && ttfCount >= expectedCount
	}

	return woff2Count >= expectedCount
}

/**
 * Clean up old TTF files (for re-conversion)
 */
async function cleanupTTF() {
	console.log('Cleaning up old TTF files...')
	let cleaned = 0

	for (const spec of FONT_SPECS) {
		const fontDir = join(FONTS_DIR, spec.dir)
		if (!existsSync(fontDir)) continue

		const files = readdirSync(fontDir)
		for (const file of files) {
			if (file.endsWith('.ttf')) {
				const ttfPath = join(fontDir, file)
				unlinkSync(ttfPath)
				cleaned++
			}
		}

		// Also clean temp directory
		const tempDir = join(fontDir, '.temp')
		if (existsSync(tempDir)) {
			const tempFiles = readdirSync(tempDir)
			for (const file of tempFiles) {
				unlinkSync(join(tempDir, file))
			}
			try {
				rmdirSync(tempDir)
			} catch {
				/* ignore */
			}
		}
	}

	console.log(`  Removed ${cleaned} TTF files`)
}

/**
 * Main function
 */
async function main() {
	const force = process.argv.includes('--force')
	const cleanOld = process.argv.includes('--clean')

	console.log('Cloudillo Fonts Download Script')
	console.log('================================')
	console.log(`Fonts directory: ${FONTS_DIR}`)
	console.log(`Force re-download: ${force}`)
	console.log('')

	// Check for tools
	const hasPython = checkPython()

	console.log('Tool availability:')
	console.log(
		`  Python fonttools: ${hasPython ? 'OK' : 'NOT FOUND (static font conversion disabled)'}`
	)
	console.log('')

	if (!hasPython) {
		console.log('To enable static TTF generation for PDF export:')
		console.log('  Install fonttools: pip install fonttools brotli')
		console.log('')
	}

	console.log('Sources:')
	console.log('  WOFF2: Google Fonts API (for browser CSS)')
	console.log(
		'  TTF:   Full upstream files from github.com/google/fonts, made static with fonttools'
	)
	console.log('')

	if (!existsSync(FONTS_DIR)) {
		mkdirSync(FONTS_DIR, { recursive: true })
	}

	// Clean old TTF files if requested
	if (cleanOld || force) {
		await cleanupTTF()
		console.log('')
	}

	let processed = 0
	let skipped = 0
	let failed = 0

	const requireTTF = hasPython

	for (const spec of FONT_SPECS) {
		if (!force && isFontComplete(spec, requireTTF)) {
			console.log(`Skipping ${spec.family} (complete)`)
			skipped++
			continue
		}

		const success = await processFont(spec, hasPython)
		if (success) {
			processed++
		} else {
			failed++
		}

		// Small delay between fonts to avoid rate limiting
		await new Promise((r) => setTimeout(r, 100))
	}

	console.log('')
	console.log('Summary:')
	console.log(`  Processed: ${processed}`)
	console.log(`  Skipped: ${skipped}`)
	console.log(`  Failed: ${failed}`)

	if (failed > 0) {
		console.log('')
		console.log('Some fonts failed. Run again or use --force to retry.')
		process.exit(1)
	}
}

main().catch((error) => {
	console.error('Fatal error:', error)
	process.exit(1)
})
