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
import { Link, NavLink, Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuAtSign as IcInvitations,
	LuUserCog as IcUsers,
	LuMenu as IcMenu
} from 'react-icons/lu'

import { useAuth, useApi, Fcb } from '@cloudillo/react'

import { Invitations } from './invitations.js'

export function SiteAdmin({ title, children }: { title: string, children?: React.ReactNode }) {
	const navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)

	React.useEffect(function onLocationEffect() {
		setShowFilter(false)
	}, [location])

	return <Fcb.Container className="g-1">
		<Fcb.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
			<ul className="c-nav vertical low">
				<li><NavLink className="c-nav-link" to="/site-admin/invitations"><IcInvitations/> {t('Invitations')}</NavLink></li>
			</ul>
		</Fcb.Filter>
		<Fcb.Content>
			<div className="c-nav c-hbox md-hide lg-hide">
				<IcMenu onClick={() => setShowFilter(true)}/>
				<h3>{title}</h3>
			</div>
			{children}
		</Fcb.Content>
	</Fcb.Container>
}

export function SiteAdminRoutes() {
	const { t } = useTranslation()

	return <Routes>
		<Route path="/site-admin" element={<SiteAdmin title={t('Main')}/>}/>
		<Route path="/site-admin/invitations" element={
			<SiteAdmin title={t('Invitations')}><Invitations/></SiteAdmin>
		}/>
		<Route path="/*" element={null}/>
	</Routes>
}

// vim: ts=4
