#!/usr/bin/env node

import esbuild from 'esbuild'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import {
	buildApp,
	buildHTML,
	createConfig,
	emitCloudilloManifest
} from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

const config = createConfig({
	outdir: `dist/assets-${pkg.version}`,
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	}
})

buildApp(esbuild, {
	config,
	projectDir: __dirname,
	onBuild: async () => {
		buildHTML(
			join(__dirname, 'src/index.html'),
			join(__dirname, 'dist/index.html'),
			pkg.version
		)
		// Ships this app's content-type declarations to the backend; see
		// `emitCloudilloManifest`.
		await emitCloudilloManifest(esbuild, { projectDir: __dirname })
	}
})

// vim: ts=4
