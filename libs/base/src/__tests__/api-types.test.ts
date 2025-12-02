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

import * as T from '@symbion/runtype'
import * as Types from '../api-types'

describe('API Type Validators', () => {
	describe('Auth Types', () => {
		describe('tLoginResult', () => {
			it('should validate correct login result', () => {
				const data = {
					tnId: 1,
					idTag: 'alice',
					token: 'jwt-token',
					name: 'Alice',
					profilePic: 'pic.jpg',
					roles: ['admin'],
					settings: [['theme', 'dark']]
				}

				const result = T.decode(Types.tLoginResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate optional roles field', () => {
				const data = {
					tnId: 1,
					idTag: 'alice',
					token: 'jwt-token',
					name: 'Alice',
					profilePic: 'pic.jpg',
					settings: []
				}

				const result = T.decode(Types.tLoginResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should reject missing required fields', () => {
				const data = {
					tnId: 1,
					idTag: 'alice'
					// missing token
				}

				const result = T.decode(Types.tLoginResult, data)
				expect(T.isErr(result)).toBe(true)
			})
		})

		describe('tAccessTokenResult', () => {
			it('should validate token', () => {
				const data = { token: 'access-token' }
				const result = T.decode(Types.tAccessTokenResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should reject missing token', () => {
				const data = {}
				const result = T.decode(Types.tAccessTokenResult, data)
				expect(T.isErr(result)).toBe(true)
			})
		})

		describe('tIdTagResult', () => {
			it('should validate id tag', () => {
				const data = { idTag: 'alice' }
				const result = T.decode(Types.tIdTagResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should reject missing idTag', () => {
				const data = {}
				const result = T.decode(Types.tIdTagResult, data)
				expect(T.isErr(result)).toBe(true)
			})
		})
	})

	describe('File Types', () => {
		describe('tFileView', () => {
			it('should validate complete file view', () => {
				const data = {
					fileId: 'f1',
					status: 'P',
					preset: 'gallery',
					contentType: 'image/jpeg',
					fileName: 'photo.jpg',
					fileTp: 'BLOB',
					createdAt: new Date().toISOString(),
					tags: ['vacation', 'summer'],
					x: { dim: [1920, 1080] },
					owner: {
						idTag: 'alice',
						name: 'Alice'
					}
				}

				const result = T.decode(Types.tFileView, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate minimal file view', () => {
				const data = {
					fileId: 'f1',
					status: 'P',
					contentType: 'text/plain',
					fileName: 'test.txt',
					createdAt: new Date().toISOString()
				}

				const result = T.decode(Types.tFileView, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should reject invalid status', () => {
				const data = {
					fileId: 'f1',
					status: 'INVALID',
					contentType: 'text/plain',
					fileName: 'test.txt',
					createdAt: new Date().toISOString()
				}

				const result = T.decode(Types.tFileView, data)
				expect(T.isErr(result)).toBe(true)
			})
		})

		describe('tListFilesResult', () => {
			it('should validate list with multiple files', () => {
				const data = {
					files: [
						{
							fileId: 'f1',
							status: 'P',
							contentType: 'text/plain',
							fileName: 'test.txt',
							createdAt: new Date().toISOString()
						},
						{
							fileId: 'f2',
							status: 'M',
							contentType: 'application/json',
							fileName: 'data.json',
							createdAt: new Date().toISOString()
						}
					]
				}

				const result = T.decode(Types.tListFilesResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate empty file list', () => {
				const data = { files: [] }
				const result = T.decode(Types.tListFilesResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})

		describe('tCreateFileResult', () => {
			it('should validate file creation result', () => {
				const data = { fileId: 'new-file-123' }
				const result = T.decode(Types.tCreateFileResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})

		describe('tTagResult', () => {
			it('should validate tag result with multiple tags', () => {
				const data = { tags: ['vacation', 'summer', 'beach'] }
				const result = T.decode(Types.tTagResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate empty tag list', () => {
				const data = { tags: [] }
				const result = T.decode(Types.tTagResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})
	})

	describe('Profile Types', () => {
		describe('tProfileKeys', () => {
			it('should validate profile with keys', () => {
				const data = {
					idTag: 'alice',
					name: 'Alice',
					type: 'person',
					profilePic: 'pic.jpg',
					keys: ['key1', 'key2']
				}

				const result = T.decode(Types.tProfileKeys, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate minimal profile', () => {
				const data = {
					idTag: 'alice',
					keys: []
				}

				const result = T.decode(Types.tProfileKeys, data)
				expect(T.isOk(result)).toBe(true)
			})
		})

		describe('tImageVariants', () => {
			it('should validate all image variants', () => {
				const data = {
					hd: 'hd.jpg',
					sd: 'sd.jpg',
					tn: 'tn.jpg',
					ic: 'ic.jpg'
				}

				const result = T.decode(Types.tImageVariants, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate partial image variants', () => {
				const data = {
					hd: 'hd.jpg',
					ic: 'ic.jpg'
				}

				const result = T.decode(Types.tImageVariants, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate empty image variants', () => {
				const data = {}
				const result = T.decode(Types.tImageVariants, data)
				expect(T.isOk(result)).toBe(true)
			})
		})

		describe('tListProfilesResult', () => {
			it('should validate list of profiles', () => {
				const data = {
					profiles: [
						{
							idTag: 'alice',
							name: 'Alice'
						},
						{
							idTag: 'bob',
							name: 'Bob'
						}
					]
				}

				const result = T.decode(Types.tListProfilesResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})
	})

	describe('Settings Types', () => {
		describe('tListSettingsResult', () => {
			it('should validate array of SettingResponse', () => {
				const data = [
					{
						key: 'ui.theme',
						value: 'dark',
						scope: 'Tenant',
						permission: 'User',
						description: 'UI theme preference'
					},
					{
						key: 'auth.session_timeout',
						value: 3600,
						scope: 'Tenant',
						permission: 'Admin',
						description: 'Session timeout in seconds'
					},
					{
						key: 'server.registration_enabled',
						value: true,
						scope: 'Global',
						permission: 'Admin',
						description: 'Allow new user registrations'
					}
				]

				const result = T.decode(Types.tListSettingsResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate empty settings array', () => {
				const data: any[] = []
				const result = T.decode(Types.tListSettingsResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})

		describe('tGetSettingResult', () => {
			it('should validate SettingResponse with string value', () => {
				const data = {
					key: 'ui.theme',
					value: 'dark',
					scope: 'Tenant',
					permission: 'User',
					description: 'UI theme preference'
				}
				const result = T.decode(Types.tGetSettingResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate SettingResponse with boolean value', () => {
				const data = {
					key: 'server.registration_enabled',
					value: true,
					scope: 'Global',
					permission: 'Admin',
					description: 'Allow new user registrations'
				}
				const result = T.decode(Types.tGetSettingResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate SettingResponse with numeric value', () => {
				const data = {
					key: 'auth.session_timeout',
					value: 3600,
					scope: 'Tenant',
					permission: 'Admin',
					description: 'Session timeout in seconds'
				}
				const result = T.decode(Types.tGetSettingResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate SettingResponse with JSON value', () => {
				const data = {
					key: 'api.rate_limits',
					value: { requests: 100, window: 3600 },
					scope: 'Global',
					permission: 'Admin',
					description: 'API rate limiting configuration'
				}
				const result = T.decode(Types.tGetSettingResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})
	})

	describe('Reference Types', () => {
		describe('tRef', () => {
			it('should validate complete reference', () => {
				const data = {
					refId: 'ref-123',
					type: 'register',
					description: 'Registration invite',
					createdAt: new Date().toISOString(),
					used: false
				}

				const result = T.decode(Types.tRef, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate minimal reference', () => {
				const data = {
					refId: 'ref-123',
					type: 'register',
					createdAt: new Date().toISOString()
				}

				const result = T.decode(Types.tRef, data)
				expect(T.isOk(result)).toBe(true)
			})
		})

		describe('tDeleteRefResult', () => {
			it('should validate delete result', () => {
				const data = { refId: 'ref-123' }
				const result = T.decode(Types.tDeleteRefResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})
	})

	describe('Action Types', () => {
		describe('tReactionResponse', () => {
			it('should validate reaction response', () => {
				const data = { reactionId: 'react-123' }
				const result = T.decode(Types.tReactionResponse, data)
				expect(T.isOk(result)).toBe(true)
			})
		})

		describe('tListActionsResult', () => {
			it('should validate actions list', () => {
				// Note: tActionView comes from @cloudillo/types
				// This test verifies the list structure
				const data = { actions: [] }
				const result = T.decode(Types.tListActionsResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})

		describe('tInboundAction', () => {
			it('should validate inbound action', () => {
				const data = {
					token: 'action-token',
					related: ['related-1', 'related-2']
				}

				const result = T.decode(Types.tInboundAction, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate inbound action without related', () => {
				const data = { token: 'action-token' }
				const result = T.decode(Types.tInboundAction, data)
				expect(T.isOk(result)).toBe(true)
			})
		})
	})

	describe('Tag Types', () => {
		describe('tListTagsResult', () => {
			it('should validate tags list', () => {
				const data = {
					tags: [
						{ tag: 'vacation' },
						{ tag: 'summer', count: 5 },
						{ tag: 'beach', count: 3 }
					]
				}

				const result = T.decode(Types.tListTagsResult, data)
				expect(T.isOk(result)).toBe(true)
			})

			it('should validate empty tags list', () => {
				const data = { tags: [] }
				const result = T.decode(Types.tListTagsResult, data)
				expect(T.isOk(result)).toBe(true)
			})
		})
	})

	describe('Error Cases', () => {
		it('should handle missing required fields', () => {
			const data = { idTag: 'alice' } // missing name, token, etc.
			const result = T.decode(Types.tLoginResult, data)
			expect(T.isErr(result)).toBe(true)
		})

		it('should handle invalid types', () => {
			const data = {
				tnId: 'not-a-number',
				idTag: 'alice'
			}

			const result = T.decode(Types.tLoginResult, data)
			expect(T.isErr(result)).toBe(true)
		})

		it('should handle invalid literal values', () => {
			const data = {
				fileId: 'f1',
				status: 'INVALID',
				contentType: 'text/plain',
				fileName: 'test.txt',
				createdAt: new Date().toISOString()
			}

			const result = T.decode(Types.tFileView, data)
			expect(T.isErr(result)).toBe(true)
		})
	})

	describe('Date Handling', () => {
		it('should accept ISO date strings', () => {
			const data = {
				fileId: 'f1',
				status: 'P',
				contentType: 'text/plain',
				fileName: 'test.txt',
				createdAt: '2024-01-01T00:00:00Z'
			}

			const result = T.decode(Types.tFileView, data)
			expect(T.isOk(result)).toBe(true)
		})

		it('should accept Date objects', () => {
			const data = {
				fileId: 'f1',
				status: 'P',
				contentType: 'text/plain',
				fileName: 'test.txt',
				createdAt: new Date()
			}

			const result = T.decode(Types.tFileView, data)
			expect(T.isOk(result)).toBe(true)
		})
	})
})

// vim: ts=2
