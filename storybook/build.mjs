import * as esbuild from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { gzip } from 'zlib'
import { promisify } from 'util'

const gzipAsync = promisify(gzip)
const isWatch = process.argv.includes('--watch')
const isProd = !isWatch

console.log(`Building storybook (${isProd ? 'production' : 'development'})...`)

// For production, use build() instead of context() to avoid caching
if (isProd) {
	await Promise.all([
		esbuild.build({
			entryPoints: ['src/index.tsx'],
			bundle: true,
			minify: true,
			target: 'es2020',
			format: 'iife',
			outfile: 'dist/assets/index.js',
			platform: 'browser',
			jsx: 'automatic',
			loader: {
				'.tsx': 'tsx',
				'.ts': 'ts',
				'.jsx': 'jsx',
				'.js': 'js'
			},
			define: {
				'process.env.NODE_ENV': '"production"'
			},
			logLevel: 'info'
		}),
		esbuild.build({
			entryPoints: ['.cache/styles.css'],
			bundle: true,
			minify: true,
			outfile: 'dist/assets/index.css',
			loader: {
				'.css': 'css',
				'.jpg': 'dataurl',
				'.png': 'dataurl'
			},
			logLevel: 'info'
		})
	])

	// Gzip the output files
	console.log('Creating gzipped versions...')
	try {
		const jsContent = readFileSync('dist/assets/index.js')
		const cssContent = readFileSync('dist/assets/index.css')

		const jsGzipped = await gzipAsync(jsContent)
		const cssGzipped = await gzipAsync(cssContent)

		writeFileSync('dist/assets/index.js.gz', jsGzipped)
		writeFileSync('dist/assets/index.css.gz', cssGzipped)

		console.log('Gzipped files created')
	} catch (err) {
		console.error('Error creating gzipped files:', err)
	}

	console.log('Build complete!')
} else {
	// Watch mode
	// Build JavaScript/TypeScript (watch mode)
	const jsContext = await esbuild.context({
	entryPoints: ['src/index.tsx'],
	bundle: true,
	minify: isProd,
	sourcemap: !isProd,
	target: 'es2020',
	format: 'iife',
	outfile: 'dist/assets/index.js',
	platform: 'browser',
	jsx: 'automatic',
	loader: {
		'.tsx': 'tsx',
		'.ts': 'ts',
		'.jsx': 'jsx',
		'.js': 'js'
	},
	define: {
		'process.env.NODE_ENV': isProd ? '"production"' : '"development"'
	},
	logLevel: 'info'
})

	// Build CSS (watch mode)
	const cssContext = await esbuild.context({
		entryPoints: ['.cache/styles.css'],
		bundle: true,
		minify: false,
		sourcemap: true,
		outfile: 'dist/assets/index.css',
		loader: {
			'.css': 'css',
			'.jpg': 'dataurl',
			'.png': 'dataurl'
		},
		logLevel: 'info'
	})

	console.log('Watching for changes...')
	await Promise.all([
		jsContext.watch(),
		cssContext.watch()
	])
}
