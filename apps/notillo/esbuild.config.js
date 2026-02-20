#!/usr/bin/env node

import esbuild from 'esbuild'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createConfig, buildApp, buildHTML } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

// Resolve npm `buffer` package path (not the Node built-in)
const bufferDir = dirname(require.resolve('buffer/package.json'))

const config = createConfig({
	outdir: `dist/assets-${pkg.version}`,
	extra: {
		conditions: ['style'],
		inject: [join(__dirname, 'src/buffer-shim.js')],
		alias: { buffer: bufferDir }
	}
})

buildApp(esbuild, {
	config,
	projectDir: __dirname,
	onBuild: () =>
		buildHTML(
			join(__dirname, 'src/index.html'),
			join(__dirname, 'dist/index.html'),
			pkg.version
		)
})

// vim: ts=4
