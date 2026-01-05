#!/usr/bin/env node

import esbuild from 'esbuild'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createConfig, buildApp, buildHTML } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

const config = createConfig({
	outdir: `dist/assets-${pkg.version}`,
	extra: {
		// Mark font paths as external - they're served at runtime from shell's /fonts/
		external: ['/fonts/*']
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
