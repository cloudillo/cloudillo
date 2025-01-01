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

export interface MessageBusAdapter {
	subscribeOnline(subsId: string, idTag: string, callback: (idTag: string, msgType: string, payload: any) => Promise<boolean>): Promise<void>
	unsubscribeOnline(subsId: string, idTag: string): void

	subscribeOffline(subsId: string, callback: (idTag: string, msgType: string, payload: any) => Promise<boolean>): Promise<void>
	unsubscribeOffline(subsId: string): void

	sendMessage(idTag: string, msgType: string, payload: any): Promise<void>
}

// vim: ts=4