#!/usr/bin/env node

import esbuild from 'esbuild'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { buildAppEntry, buildHTML } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

buildAppEntry(esbuild, {
	projectDir: __dirname,
	extra: {
		// Two entries side by side in dist/assets-<version>/: index.js and receiver.js
		// (the Presentation API receiver page, dist/receiver.html)
		entryPoints: ['src/index.tsx', 'src/receiver.tsx'],
		entryNames: '[name]',
		// Mark font paths as external - they're served at runtime from shell's /fonts/
		external: ['/fonts/*']
	},
	onBuild: (pkg) =>
		buildHTML(
			join(__dirname, 'src/receiver.html'),
			join(__dirname, 'dist/receiver.html'),
			pkg.version
		)
})

// vim: ts=4
