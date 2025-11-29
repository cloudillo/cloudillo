// Shared esbuild configuration and build utilities
// Usage: import { createConfig, buildApp } from '../../scripts/esbuild-common.js'

import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { gzipSync, brotliCompressSync, constants } from 'zlib'

// Environment
export const isProd = process.env.NODE_ENV === 'production'
export const isWatch = process.argv.includes('--watch') || process.argv.includes('-w')
export const shouldCompress = isProd && !isWatch

// Compression settings
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
	if (!existsSync(dirPath)) return 0
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

export function compressAll(distDir) {
	console.log('Compressing files...')
	const count = compressDirectory(distDir)
	console.log(`Compressed ${count} files`)
}

// Delete stale compressed files (for watch mode)
export function deleteCompressedFiles(dirPath) {
	if (!existsSync(dirPath)) return 0
	const entries = readdirSync(dirPath)
	let count = 0

	for (const entry of entries) {
		const fullPath = join(dirPath, entry)
		const stat = statSync(fullPath)

		if (stat.isDirectory()) {
			count += deleteCompressedFiles(fullPath)
		} else if (stat.isFile() && (entry.endsWith('.gz') || entry.endsWith('.br'))) {
			unlinkSync(fullPath)
			count++
		}
	}

	return count
}

// HTML processing
export function buildHTML(srcPath, distPath, version) {
	const sourceHtml = readFileSync(srcPath, 'utf-8')
	const processedHtml = sourceHtml.replace(/@VERSION@/g, version)
	writeFileSync(distPath, processedHtml)
	console.log('HTML processed')
}

// Default loaders for assets
const defaultLoaders = {
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
}

/**
 * Create esbuild config with sensible defaults
 * @param {Object} options
 * @param {string} options.entryPoint - Entry point file (default: 'src/index.tsx')
 * @param {string} options.outdir - Output directory
 * @param {Object} options.define - Additional define values
 * @param {Object} options.loader - Additional/override loaders
 * @param {Object} options.alias - Module aliases
 * @param {string[]} options.nodePaths - Additional node paths
 * @param {Object} options.extra - Any additional esbuild options
 */
export function createConfig(options = {}) {
	const {
		entryPoint = 'src/index.tsx',
		outdir,
		define = {},
		loader = {},
		alias,
		nodePaths,
		extra = {}
	} = options

	const config = {
		entryPoints: [entryPoint],
		bundle: true,
		outdir,
		format: 'esm',
		platform: 'browser',
		target: ['es2021'],
		sourcemap: !isProd,
		minify: isProd,
		loader: { ...defaultLoaders, ...loader },
		assetNames: '[name]-bundle',
		entryNames: 'index',
		chunkNames: '[name]-[hash]',
		splitting: true,
		define: {
			'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
			...define
		},
		logLevel: 'info',
		logOverride: {
			'direct-eval': 'silent'
		},
		treeShaking: true,
		metafile: isProd,
		...extra
	}

	if (alias) config.alias = alias
	if (nodePaths) config.nodePaths = nodePaths

	return config
}

/**
 * Build the app with watch mode support, compression, and cleanup
 * @param {Object} esbuild - esbuild module (passed in to avoid module resolution issues)
 * @param {Object} options
 * @param {Object} options.config - esbuild config from createConfig()
 * @param {string} options.projectDir - Project root directory (__dirname)
 * @param {Function} options.onBuild - Optional callback before build (e.g., for HTML processing)
 */
export async function buildApp(esbuild, options) {
	const { config, projectDir, onBuild } = options
	const distDir = join(projectDir, 'dist')

	try {
		// Run pre-build hook (typically HTML processing)
		if (onBuild) onBuild()

		if (isWatch) {
			// Delete stale compressed files in watch mode
			const deleted = deleteCompressedFiles(distDir)
			if (deleted > 0) console.log(`Deleted ${deleted} stale compressed files`)

			const context = await esbuild.context(config)
			await context.watch()
			console.log('Watching for changes...')
		} else {
			const result = await esbuild.build(config)

			if (isProd && result.metafile) {
				const analysis = await esbuild.analyzeMetafile(result.metafile, {
					verbose: false
				})
				console.log('\nBundle analysis:')
				console.log(analysis)
			}

			console.log('Build complete!')

			if (shouldCompress) {
				compressAll(distDir)
			}
		}
	} catch (error) {
		console.error('Build failed:', error)
		process.exit(1)
	}
}

// vim: ts=4
