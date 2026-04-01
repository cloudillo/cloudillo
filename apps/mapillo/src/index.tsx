// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createRoot } from 'react-dom/client'

import { MapilloApp } from './app.js'

const app = document.getElementById('app')
const root = createRoot(app!)
root.render(<MapilloApp />)

// vim: ts=4
