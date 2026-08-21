#!/usr/bin/env node

import esbuild from 'esbuild'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { buildAppEntry } from '../../scripts/esbuild-common.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

buildAppEntry(esbuild, { projectDir: __dirname })

// vim: ts=4
