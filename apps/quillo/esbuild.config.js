#!/usr/bin/env node

import esbuild from 'esbuild'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { buildAppEntry } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

buildAppEntry(esbuild, {
	projectDir: __dirname,
	entryPoint: 'src/quillo.ts',
	extra: {
		// Mark font paths as external - they're served at runtime from shell's /fonts/
		external: ['/fonts/*']
	}
})

// vim: ts=4
