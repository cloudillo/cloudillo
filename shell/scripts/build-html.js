#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// Read package.json to get version
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'))

// Read source HTML
const sourceHtml = readFileSync(join(rootDir, 'src/index.html'), 'utf-8')

// Replace @VERSION@ with actual version
const processedHtml = sourceHtml.replace(/@VERSION@/g, pkg.version)

// Write to dist
writeFileSync(join(rootDir, 'dist/index.html'), processedHtml)

console.log(`✅ HTML processed: version ${pkg.version}`)

// vim: ts=4
