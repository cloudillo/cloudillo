#!/usr/bin/env node

/**
 * Font Download Script
 * Downloads the full (non-subset) upstream TTFs from github.com/google/fonts and makes them static
 * with fonttools. The same TTFs serve browser CSS (precompressed by the build), typeset and PDF.
 * Roboto also gets a variable woff2 for on-screen UI text only (`UI_FONT`, family `Roboto UI`).
 *
 * Usage:
 *   node download-fonts.js          # Download missing fonts
 *   node download-fonts.js --force  # Re-download all fonts
 */

import { execFileSync } from 'child_process'
import { createHash } from 'node:crypto'
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	unlinkSync,
	writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, '..', 'fonts')
const CONVERT_SCRIPT = join(__dirname, 'convert-to-static.py')

// Font definitions
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
	{ family: 'Noto Sans SC', weights: [400, 700], italic: false, dir: 'noto-sans-sc' },

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

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url, options)
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
 * Get the local filename for a font variant
 */
function getLocalFilename(baseName, weight, isItalic, ext) {
	const weightName = WEIGHT_NAMES[weight] || weight
	return `${baseName}-${weightName}${isItalic ? 'Italic' : ''}.${ext}`
}

// Pinned google/fonts commit: a bump must update `UI_FONT.sha256`, then run `download:force`.
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

const LICENSE_FILES = { ofl: 'OFL.txt', apache: 'LICENSE.txt', ufl: 'UFL.txt' }

/**
 * Fetch a family's upstream license file into its font dir (npm ships `fonts/`), unless present
 */
async function ensureLicense(spec) {
	const fontDir = join(FONTS_DIR, spec.dir)
	if (Object.values(LICENSE_FILES).some((f) => existsSync(join(fontDir, f)))) return
	const famDir = spec.family.toLowerCase().replace(/ /g, '')
	for (const [lic, file] of Object.entries(LICENSE_FILES)) {
		const res = await fetch(`${UPSTREAM_BASE}/${lic}/${famDir}/${file}`)
		if (!res.ok) continue
		mkdirSync(fontDir, { recursive: true })
		writeFileSync(join(fontDir, file), Buffer.from(await res.arrayBuffer()))
		console.log(`  ${spec.dir}/${file}`)
		return
	}
	throw new Error(`no upstream license for ${spec.family}`)
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
function checkPython(code = 'from fontTools.varLib import instancer') {
	try {
		execFileSync('python3', ['-c', code], {
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

// Not in FONT_SPECS: these files stay out of the TTF count, metrics, typeset and PDF
const UI_FONT = {
	family: 'Roboto',
	dir: 'roboto',
	files: { normal: 'RobotoUI-Variable.woff2', italic: 'RobotoUI-VariableItalic.woff2' },
	// Of the upstream variable TTFs at `UPSTREAM_REV`: a bump of that must update these.
	sha256: {
		normal: 'd7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134',
		italic: '9725a847af6b460ffca162ae66d20dad48b01876137947180b42d7dcd7887182'
	}
}

/**
 * Build the UI font's missing woff2 files (all of them with `force`, overwriting in place).
 * Never fails the run: postinstall must survive a missing brotli or no network, and without these
 * files `Roboto UI` falls back to the static Roboto.
 */
async function ensureUiFont(force) {
	const fontDir = join(FONTS_DIR, UI_FONT.dir)
	const todo = Object.entries(UI_FONT.files).filter(
		([, file]) => force || !existsSync(join(fontDir, file))
	)
	if (!todo.length) return

	if (!checkPython('from fontTools.ttLib.woff2 import haveBrotli; assert haveBrotli')) {
		console.warn(`${UI_FONT.family} UI woff2 not built: it needs Python fonttools and brotli.`)
		return
	}

	const tempDir = join(fontDir, '.temp')
	try {
		mkdirSync(tempDir, { recursive: true })
		const upstream = await fetchUpstreamFonts(UI_FONT.family)
		for (const [style, file] of todo) {
			const src = upstream.find((u) => u.style === style && u.variable)
			if (!src) throw new Error(`no upstream variable TTF for ${style}`)

			const tempTTFPath = join(tempDir, `upstream-${file}.ttf`)
			await downloadFile(src.url, tempTTFPath)
			const sha256 = createHash('sha256').update(readFileSync(tempTTFPath)).digest('hex')
			if (sha256 !== UI_FONT.sha256[style]) {
				throw new Error(`checksum mismatch for the ${style} upstream TTF: ${sha256}`)
			}
			execFileSync(
				'python3',
				[CONVERT_SCRIPT, tempTTFPath, join(fontDir, file), 'variable'],
				{
					encoding: 'utf-8',
					stdio: ['pipe', 'pipe', 'pipe']
				}
			)
			console.log(`  Created UI woff2: ${file}`)
		}
	} catch (error) {
		console.warn(`${UI_FONT.family} UI woff2 failed: ${error.message}`)
	} finally {
		rmSync(tempDir, { recursive: true, force: true })
	}
}

/**
 * Download upstream TTFs and convert them to static TTF
 */
async function downloadAndConvertFonts(spec) {
	const { family, weights, italic, dir } = spec
	const fontDir = join(FONTS_DIR, dir)
	const tempDir = join(fontDir, '.temp')

	if (!existsSync(fontDir)) {
		mkdirSync(fontDir, { recursive: true })
	}

	if (!existsSync(tempDir)) {
		mkdirSync(tempDir, { recursive: true })
	}

	let upstream = null

	const baseName = dir
		.split('-')
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join('')

	for (const weight of weights) {
		for (const isItalic of italic ? [false, true] : [false]) {
			const ttfFilename = getLocalFilename(baseName, weight, isItalic, 'ttf')
			const ttfPath = join(fontDir, ttfFilename)
			if (existsSync(ttfPath)) continue

			// Static TTF from the full upstream file (variable → instanced, static → re-saved)
			upstream ??= await fetchUpstreamFonts(family)
			const style = isItalic ? 'italic' : 'normal'
			const src =
				upstream.find((u) => u.style === style && !u.variable && u.weight === weight) ??
				upstream.find((u) => u.style === style && u.variable)
			if (!src) throw new Error(`no upstream TTF for ${family} ${weight} ${style}`)

			const tempTTFPath = join(tempDir, `upstream-${ttfFilename}`)
			await downloadFile(src.url, tempTTFPath)
			if (!convertVariableToStatic(tempTTFPath, ttfPath, weight, isItalic)) {
				throw new Error(`static conversion failed for ${ttfFilename}`)
			}
			unlinkSync(tempTTFPath)
			console.log(`  Created static TTF: ${ttfFilename}`)
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
async function processFont(spec) {
	const { family } = spec

	console.log(`Processing ${family}...`)

	try {
		await downloadAndConvertFonts(spec)
		return true
	} catch (error) {
		console.error(`  Error processing ${family}: ${error.message}`)
		return false
	}
}

/**
 * Check if a font directory has all expected files
 */
function isFontComplete(spec) {
	const fontDir = join(FONTS_DIR, spec.dir)
	if (!existsSync(fontDir)) return false

	const expectedCount = spec.weights.length * (spec.italic ? 2 : 1)
	return readdirSync(fontDir).filter((f) => f.endsWith('.ttf')).length >= expectedCount
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

	// Only the UI font is woff2: drop leftovers from older installs so they don't ship
	const uiFiles = Object.values(UI_FONT.files)
	for (const spec of FONT_SPECS) {
		const dir = join(FONTS_DIR, spec.dir)
		if (!existsSync(dir)) continue
		for (const file of readdirSync(dir)) {
			if (file.endsWith('.woff2') && !uiFiles.includes(file)) unlinkSync(join(dir, file))
		}
	}

	// Licenses don't need fonttools, so existing installs get them without re-downloading TTFs
	// Best effort: an offline install must not fail on a missing license file
	for (const spec of FONT_SPECS) {
		await ensureLicense(spec).catch((e) =>
			console.warn(`  license for ${spec.family}: ${e.message}`)
		)
	}

	// Before the TTF early return: existing installs have every TTF and still need these
	await ensureUiFont(force || cleanOld)

	const todo = force || cleanOld ? FONT_SPECS : FONT_SPECS.filter((spec) => !isFontComplete(spec))
	if (!todo.length) {
		console.log('All fonts present.')
		return
	}

	// fonttools is the only source of the TTFs: check before --force/--clean deletes anything
	if (!checkPython()) {
		console.error(`Python fonttools not found; ${todo.length} font families need it.`)
		console.error('  Install it: pip install fonttools brotli')
		console.error(
			'  NixOS: nix-shell -p python3Packages.fonttools python3Packages.brotli --run "pnpm -C libs/fonts download"'
		)
		process.exit(1)
	}

	console.log(
		'Source: full upstream TTFs from github.com/google/fonts, made static with fonttools'
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

	for (const spec of FONT_SPECS) {
		if (!todo.includes(spec)) {
			console.log(`Skipping ${spec.family} (complete)`)
			skipped++
			continue
		}

		const success = await processFont(spec)
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
