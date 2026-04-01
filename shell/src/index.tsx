// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { IconContext } from 'react-icons'

import './i18n.js'
import { Layout } from './layout.js'

function App(_props: React.PropsWithChildren<object>) {
	return (
		<DndProvider backend={HTML5Backend}>
			<IconContext.Provider value={{ size: '1.5rem' }}>
				<BrowserRouter basename="/">
					<Layout />
				</BrowserRouter>
			</IconContext.Provider>
		</DndProvider>
	)
}

const app = document.getElementById('app')
const root = createRoot(app!)
root.render(<App />)

// vim: ts=4
