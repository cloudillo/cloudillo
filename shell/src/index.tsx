// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { IconContext } from 'react-icons'

import './i18n.js'
import { Layout } from './layout.js'

function App(props: React.PropsWithChildren<{}>) {
	return <DndProvider backend={HTML5Backend}>
		<IconContext.Provider value={{ size: '1.5rem' }}>
			<BrowserRouter basename="/">
				<Layout/>
			</BrowserRouter>
		</IconContext.Provider>	
	</DndProvider>
}

const app = document.getElementById('app')
const root = createRoot(app!)
root.render(<App/>)

// vim: ts=4
