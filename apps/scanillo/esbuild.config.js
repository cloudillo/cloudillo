#!/usr/bin/env node

import esbuild from 'esbuild'
import { copyFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { buildAppEntry } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

buildAppEntry(esbuild, {
	projectDir: __dirname,
	extra: {
		// Mark font paths as external - they're served at runtime from shell's /fonts/
		external: ['/fonts/*']
	},
	onBuild: async (_pkg, config) => {
		// Copy OpenCV.js from jscanify for dynamic loading
		const outdir = join(__dirname, config.outdir)
		mkdirSync(outdir, { recursive: true })
		copyFileSync(
			join(__dirname, 'node_modules/jscanify/src/opencv.js'),
			join(outdir, 'opencv.js')
		)
		console.log('Copied opencv.js')
	}
})

// vim: ts=4
