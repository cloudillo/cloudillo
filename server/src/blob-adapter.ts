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

import { ReadStream } from 'fs'

import * as T from '@symbion/runtype'

export type BlobData = string | Buffer | ReadStream

export interface WriteBlobOptions {
	force?: boolean
	public?: boolean
}

export interface BlobAdapter {
	writeBlob: (
		tnId: number,
		fileId: string,
		label: string,
		data: BlobData,
		opts?: WriteBlobOptions
	) => Promise<void>
	readBlob: (tnId: number, fileId: string, label?: string) => Promise<Buffer>
	openBlob: (tnId: number, fileId: string, label?: string) => Promise<ReadStream>
	checkBlob: (tnId: number, fileId: string, label?: string) => Promise<boolean>
}

// vim: ts=4
