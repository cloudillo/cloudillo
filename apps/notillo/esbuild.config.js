#!/usr/bin/env node

import esbuild from 'esbuild'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { buildAppEntry } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Resolve npm `buffer` package path (not the Node built-in)
const bufferDir = dirname(require.resolve('buffer/package.json'))

buildAppEntry(esbuild, {
	projectDir: __dirname,
	extra: {
		conditions: ['style'],
		inject: [join(__dirname, 'src/buffer-shim.js')],
		alias: { buffer: bufferDir }
	}
})

// vim: ts=4
