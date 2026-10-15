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
		// node-only `await import('module')` branch (hunspell-wasm's: also 'fs/promises'), never
		// reached in a browser
		external: ['/fonts/*', 'module', 'fs/promises']
	},
	// harfbuzzjs locates harfbuzz.wasm next to the importing bundle (layout-worker.js)
	onBuild: (_pkg, config) => {
		const outdir = join(__dirname, config.outdir)
		mkdirSync(outdir, { recursive: true })
		copyFileSync(
			require.resolve('harfbuzzjs/dist/harfbuzz.wasm'),
			join(outdir, 'harfbuzz.wasm')
		)
		// Hunspell (hunspell-wasm finds hunspell.wasm beside the bundle) and the dictionaries
		// worker/spell.ts fetches as spell/<lang>.aff|.dic. hunspell-wasm is
		// (LGPL-2.0 OR GPL-2.0 OR MPL-1.1), used under MPL-1.1; its licence texts ship beside it.
		copyFileSync(
			require.resolve('hunspell-wasm/wasm/hunspell.wasm'),
			join(outdir, 'hunspell.wasm')
		)
		const hs = dirname(require.resolve('hunspell-wasm/package.json'))
		for (const f of ['COPYING', 'COPYING.LESSER', 'COPYING.MPL'])
			copyFileSync(join(hs, f), join(outdir, `hunspell.${f}`))
		mkdirSync(join(outdir, 'spell'), { recursive: true })
		// The dictionaries are runtime data aggregated with (not linked into) the app, each under
		// its own license, shipped beside it (`spell/<lang>.license`): en (MIT AND BSD); hu is
		// used under MPL-1.1, as hunspell-wasm is; de is GPL, fetched separately at runtime on
		// first use of the language (mere aggregation, never linked into the LGPL bundle)
		for (const lang of ['en', 'hu', 'de']) {
			const dir = dirname(require.resolve(`dictionary-${lang}`))
			for (const ext of ['aff', 'dic'])
				copyFileSync(join(dir, `index.${ext}`), join(outdir, 'spell', `${lang}.${ext}`))
			copyFileSync(join(dir, 'license'), join(outdir, 'spell', `${lang}.license`))
		}
	}
})

// vim: ts=4
