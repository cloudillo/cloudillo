#!/usr/bin/env node

import esbuild from 'esbuild'
import { readFileSync, writeFileSync, cpSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { gzipSync, brotliCompressSync, constants } from 'zlib'
import { readdirSync, statSync } from 'fs'
import { extname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

const isProd = process.env.NODE_ENV === 'production'
const isWatch = process.argv.includes('--watch') || process.argv.includes('-w')
const shouldCompress = isProd && !isWatch

// HTML processing
function buildHTML() {
	const sourceHtml = readFileSync(join(__dirname, 'src/index.html'), 'utf-8')
	const processedHtml = sourceHtml.replace(/@VERSION@/g, pkg.version)
	writeFileSync(join(__dirname, 'dist/index.html'), processedHtml)
	console.log('✅ HTML processed')
}

// Compression
const COMPRESSIBLE_EXTENSIONS = ['.js', '.css', '.html', '.json', '.svg', '.xml']
const MIN_SIZE = 1024

function shouldCompressFile(filename) {
	return COMPRESSIBLE_EXTENSIONS.includes(extname(filename))
}

function compressFile(filePath) {
	const content = readFileSync(filePath)
	if (content.length < MIN_SIZE) return

	const gzipped = gzipSync(content, { level: 9 })
	writeFileSync(`${filePath}.gz`, gzipped)

	const brotlied = brotliCompressSync(content, {
		params: {
			[constants.BROTLI_PARAM_QUALITY]: 11,
			[constants.BROTLI_PARAM_SIZE_HINT]: content.length
		}
	})
	writeFileSync(`${filePath}.br`, brotlied)
}

function compressDirectory(dirPath) {
	const entries = readdirSync(dirPath)
	let count = 0

	for (const entry of entries) {
		const fullPath = join(dirPath, entry)
		const stat = statSync(fullPath)

		if (stat.isDirectory()) {
			count += compressDirectory(fullPath)
		} else if (stat.isFile() && shouldCompressFile(entry)) {
			compressFile(fullPath)
			count++
		}
	}

	return count
}

function compressAll() {
	console.log('🗜️  Compressing files...')
	const count = compressDirectory(join(__dirname, 'dist'))
	console.log(`✅ Compressed ${count} files`)
}

// Main app esbuild config
const appConfig = {
	entryPoints: ['src/index.tsx'],
	bundle: true,
	outdir: `dist/assets-${pkg.version}`,
	format: 'esm',
	platform: 'browser',
	target: ['es2021'],
	sourcemap: !isProd,
	minify: isProd,
	loader: {
		'.css': 'css',
		'.svg': 'file',
		'.png': 'file',
		'.jpg': 'file',
		'.jpeg': 'file',
		'.gif': 'file',
		'.woff': 'file',
		'.woff2': 'file',
		'.ttf': 'file',
		'.eot': 'file'
	},
	assetNames: '[name]-bundle',
	entryNames: 'index',
	chunkNames: '[name]-[hash]',
	splitting: true,
	define: {
		'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
		'process.env.CLOUDILLO_VERSION': JSON.stringify(pkg.version)
	},
	logOverride: {
		'direct-eval': 'silent'
	},
	treeShaking: true,
	metafile: isProd,
}

// Service worker esbuild config
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
		'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development')
	},
	treeShaking: true,
	metafile: isProd,
}

async function build() {
	try {
		// Build HTML first (needed for both dev and prod)
		buildHTML()

		if (isWatch) {
			// Watch mode: create contexts for both builds
			const appContext = await esbuild.context(appConfig)
			const swContext = await esbuild.context(swConfig)

			await Promise.all([
				appContext.watch(),
				swContext.watch()
			])

			console.log('👀 Watching app and service worker for changes...')
			console.log('   Press Ctrl+C to stop')

			// Keep the process running
			process.on('SIGINT', async () => {
				console.log('\n⏹️  Stopping watch mode...')
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

			// Show bundle analysis
			if (isProd && appResult.metafile) {
				const analysis = await esbuild.analyzeMetafile(appResult.metafile, {
					verbose: false
				})
				console.log('\n📊 App bundle analysis:')
				console.log(analysis)
			}

			console.log('✅ App and service worker build complete!')

			// Compress in production
			if (shouldCompress) {
				compressAll()
			}
		}
	} catch (error) {
		console.error('❌ Build failed:', error)
		process.exit(1)
	}
}

build()

// vim: ts=4
