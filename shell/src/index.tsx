// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Library CSS must precede every module that imports shell CSS: esbuild orders the
// bundle by first import, and shell rules (e.g. `--container-max-width`) must win.
// The shell's own markup uses component-library classes (`.c-input-icon`,
// `.c-input-clear`, TreeView, …), so components.css is an entry-point dependency too.
import '@symbion/opalui'
import '@symbion/opalui/themes/opaque.css'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/fonts/fonts.css'
import '@cloudillo/react/components.css'

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from 'react-icons'
import { BrowserRouter } from 'react-router-dom'

import './i18n.js'
import { Layout } from './layout.js'

function App(_props: React.PropsWithChildren<object>) {
	return (
		<IconContext.Provider value={{ size: '1.5rem' }}>
			<BrowserRouter basename="/">
				<Layout />
			</BrowserRouter>
		</IconContext.Provider>
	)
}

const app = document.getElementById('app')
const root = createRoot(app!)
root.render(<App />)

// vim: ts=4
