#!/usr/bin/env node

import esbuild from 'esbuild'
import { readFileSync, copyFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createConfig, buildApp, buildHTML } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

const outdir = `dist/assets-${pkg.version}`

const config = createConfig({
	outdir
})

buildApp(esbuild, {
	config,
	projectDir: __dirname,
	onBuild: () => {
		buildHTML(
			join(__dirname, 'src/index.html'),
			join(__dirname, 'dist/index.html'),
			pkg.version
		)
		// Copy OpenCV.js from jscanify for dynamic loading
		const opencvSrc = join(__dirname, 'node_modules/jscanify/src/opencv.js')
		const opencvDst = join(__dirname, outdir, 'opencv.js')
		mkdirSync(join(__dirname, outdir), { recursive: true })
		copyFileSync(opencvSrc, opencvDst)
		console.log('Copied opencv.js')
	}
})

// vim: ts=4
