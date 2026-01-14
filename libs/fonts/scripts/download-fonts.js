#!/usr/bin/env node
/**
 * Font Download Script
 * Downloads Google Fonts and converts variable fonts to static fonts:
 * - WOFF2 from Google Fonts API (for browser CSS)
 * - TTF converted from WOFF2 using wawoff2, then made static using fonttools
 *
 * Usage:
 *   node download-fonts.js          # Download missing fonts
 *   node download-fonts.js --force  # Re-download all fonts
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, rmdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, '..', 'fonts')
const CONVERT_SCRIPT = join(__dirname, 'convert-to-static.py')

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
 * Get the local filename for a font variant
 */
function getLocalFilename(baseName, weight, isItalic, ext) {
	const weightName = WEIGHT_NAMES[weight] || weight
	return `${baseName}-${weightName}${isItalic ? 'Italic' : ''}.${ext}`
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
 * Check if wawoff2 (woff2_decompress) is available
 */
function checkWawoff2() {
	try {
		// wawoff2 npm package provides woff2_decompress.js (shell wrapper)
		// Check local node_modules first (for standalone installs)
		const localBin = join(__dirname, '..', 'node_modules', '.bin', 'woff2_decompress.js')
		if (existsSync(localBin)) return localBin

		// Check root node_modules (for pnpm monorepo with hoisting)
		const rootBin = join(
			__dirname,
			'..',
			'..',
			'..',
			'node_modules',
			'.bin',
			'woff2_decompress.js'
		)
		if (existsSync(rootBin)) return rootBin

		// Try global woff2_decompress
		execFileSync('which', ['woff2_decompress'], { encoding: 'utf-8' })
		return 'woff2_decompress'
	} catch {
		return null
	}
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
 * Convert WOFF2 to variable TTF using wawoff2 (woff2_decompress)
 */
function convertWoff2ToTTF(woff2Path, ttfPath, wawoff2Bin) {
	try {
		// woff2_decompress.js is a shell wrapper, execute with bash
		execFileSync('bash', [wawoff2Bin, woff2Path, ttfPath], {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe']
		})
		return true
	} catch (error) {
		console.log(`  wawoff2 failed: ${error.message}`)
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
async function downloadAndConvertFonts(spec, wawoff2Bin, hasPython) {
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

	const response = await fetchWithRetry(cssUrl)
	const css = await response.text()
	const fonts = parseGoogleFontsCss(css)

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

		// Convert to static TTF if needed
		if (!existsSync(ttfPath) && wawoff2Bin && hasPython) {
			// First convert WOFF2 to variable TTF in temp dir
			const tempTTFPath = join(tempDir, `variable-${ttfFilename}`)

			if (convertWoff2ToTTF(woff2Path, tempTTFPath, wawoff2Bin)) {
				// Then convert variable TTF to static TTF
				if (convertVariableToStatic(tempTTFPath, ttfPath, font.weight, isItalic)) {
					console.log(`  Created static TTF: ${ttfFilename}`)
				}

				// Clean up temp file
				if (existsSync(tempTTFPath)) {
					unlinkSync(tempTTFPath)
				}
			}
		} else if (!existsSync(ttfPath)) {
			if (!wawoff2Bin) {
				console.log(`  Skipping TTF (wawoff2 not available)`)
			} else if (!hasPython) {
				console.log(`  Skipping TTF (Python fonttools not available)`)
			}
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
async function processFont(spec, wawoff2Bin, hasPython) {
	const { family } = spec

	console.log(`Processing ${family}...`)

	try {
		await downloadAndConvertFonts(spec, wawoff2Bin, hasPython)
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
	const wawoff2Bin = checkWawoff2()
	const hasPython = checkPython()

	console.log('Tool availability:')
	console.log(`  wawoff2: ${wawoff2Bin ? 'OK' : 'NOT FOUND (TTF conversion disabled)'}`)
	console.log(
		`  Python fonttools: ${hasPython ? 'OK' : 'NOT FOUND (static font conversion disabled)'}`
	)
	console.log('')

	if (!wawoff2Bin || !hasPython) {
		console.log('To enable static TTF generation for PDF export:')
		if (!wawoff2Bin) {
			console.log('  Install wawoff2: cd libs/fonts && pnpm add wawoff2')
		}
		if (!hasPython) {
			console.log('  Install fonttools: pip install fonttools brotli')
		}
		console.log('')
	}

	console.log('Sources:')
	console.log('  WOFF2: Google Fonts API (for browser CSS)')
	console.log('  TTF:   Converted from WOFF2 using wawoff2 + fonttools (for PDF)')
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

	const requireTTF = wawoff2Bin && hasPython

	for (const spec of FONT_SPECS) {
		if (!force && isFontComplete(spec, requireTTF)) {
			console.log(`Skipping ${spec.family} (complete)`)
			skipped++
			continue
		}

		const success = await processFont(spec, wawoff2Bin, hasPython)
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
