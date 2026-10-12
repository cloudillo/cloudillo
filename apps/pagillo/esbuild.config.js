#!/usr/bin/env node

import esbuild from 'esbuild'
import { copyFileSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { buildAppEntry } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

buildAppEntry(esbuild, {
	projectDir: __dirname,
	extra: {
		// Two entries side by side in dist/assets-<version>/: index.js and layout-worker.js
		entryPoints: ['src/index.tsx', 'src/worker/layout-worker.ts'],
		entryNames: '[name]',
		// harfbuzzjs's ESM entry uses top-level await (module Worker only; es2021 rejects it)
		target: ['es2022'],
		// Font paths are served at runtime from shell's /fonts/; 'module' is harfbuzzjs's
		// node-only `await import('module')` branch, never reached in a browser
		external: ['/fonts/*', 'module']
	},
	// harfbuzzjs locates harfbuzz.wasm next to the importing bundle (layout-worker.js)
	onBuild: (_pkg, config) => {
		const outdir = join(__dirname, config.outdir)
		mkdirSync(outdir, { recursive: true })
		copyFileSync(
			require.resolve('harfbuzzjs/dist/harfbuzz.wasm'),
			join(outdir, 'harfbuzz.wasm')
		)
	}
})

// vim: ts=4
