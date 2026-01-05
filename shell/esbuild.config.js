#!/usr/bin/env node

import esbuild from 'esbuild'
import { readFileSync, existsSync, mkdirSync, cpSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
	createConfig,
	buildHTML,
	compressAll,
	deleteCompressedFiles,
	isProd,
	isWatch,
	shouldCompress
} from '../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

/**
 * Copy fonts from libs/fonts to dist/fonts
 * Fonts are served at /fonts/ and loaded by apps via absolute URLs
 */
function copyFonts() {
	const fontsSource = join(__dirname, '..', 'libs', 'fonts', 'fonts')
	const fontsDest = join(__dirname, 'dist', 'fonts')

	if (!existsSync(fontsSource)) {
		console.log('Fonts not found - run pnpm install to download fonts')
		return
	}

	// Create destination directory
	if (!existsSync(fontsDest)) {
		mkdirSync(fontsDest, { recursive: true })
	}

	// Copy all font directories
	cpSync(fontsSource, fontsDest, { recursive: true })
	console.log('Fonts copied to dist/fonts/')
}

// Main app config
const appConfig = createConfig({
	outdir: `dist/assets-${pkg.version}`,
	define: {
		'process.env.CLOUDILLO_VERSION': JSON.stringify(pkg.version)
	},
	extra: {
		// Mark font paths as external - they're served at runtime from /fonts/
		external: ['/fonts/*']
	}
})

// Service worker config (different settings - no splitting, single output file)
const swConfig = {
	entryPoints: ['sw/index.ts'],
	bundle: true,
	outfile: `dist/sw-${pkg.version}.js`,
	format: 'esm',
	platform: 'browser',
	target: ['es2021'],
	sourcemap: !isProd,
	minify: false,
	define: {
		'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
		'process.env.CLOUDILLO_VERSION': JSON.stringify(pkg.version)
	},
	logLevel: 'info',
	treeShaking: true,
	metafile: isProd
}

async function build() {
	const distDir = join(__dirname, 'dist')

	try {
		// Build HTML
		buildHTML(
			join(__dirname, 'src/index.html'),
			join(__dirname, 'dist/index.html'),
			pkg.version
		)

		// Build manifest.json (also uses @VERSION@ placeholder)
		buildHTML(
			join(__dirname, 'src/manifest.json'),
			join(__dirname, 'dist/manifest.json'),
			pkg.version
		)

		// Copy fonts to dist/fonts/
		copyFonts()

		if (isWatch) {
			// Delete stale compressed files
			const deleted = deleteCompressedFiles(distDir)
			if (deleted > 0) console.log(`Deleted ${deleted} stale compressed files`)

			// Watch mode: create contexts for both builds
			const appContext = await esbuild.context(appConfig)
			const swContext = await esbuild.context(swConfig)

			await Promise.all([appContext.watch(), swContext.watch()])

			console.log('Watching app and service worker for changes...')
			console.log('Press Ctrl+C to stop')

			process.on('SIGINT', async () => {
				console.log('\nStopping watch mode...')
				await appContext.dispose()
				await swContext.dispose()
				process.exit(0)
			})
		} else {
			// Production build: build both in parallel
			const [appResult, swResult] = await Promise.all([
				esbuild.build(appConfig),
				esbuild.build(swConfig)
			])

			if (isProd && appResult.metafile) {
				const analysis = await esbuild.analyzeMetafile(appResult.metafile, {
					verbose: false
				})
				console.log('\nApp bundle analysis:')
				console.log(analysis)
			}

			console.log('App and service worker build complete!')

			if (shouldCompress) {
				compressAll(distDir)
			}
		}
	} catch (error) {
		console.error('Build failed:', error)
		process.exit(1)
	}
}

build()

// vim: ts=4
