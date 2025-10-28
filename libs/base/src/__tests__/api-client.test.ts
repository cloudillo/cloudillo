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

import { createApiClient, ApiClient } from '../api-client'
import * as Types from '../api-types'

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    client = createApiClient({
      idTag: 'test-user',
      authToken: 'test-token',
    })
  })

  describe('Initialization', () => {
    it('should create an API client with required options', () => {
      expect(client).toBeInstanceOf(ApiClient)
    })

    it('should create an API client without token', () => {
      const clientNoToken = createApiClient({
        idTag: 'test-user',
      })
      expect(clientNoToken).toBeInstanceOf(ApiClient)
    })

    it('should have all endpoint groups', () => {
      expect(client.auth).toBeDefined()
      expect(client.actions).toBeDefined()
      expect(client.files).toBeDefined()
      expect(client.tags).toBeDefined()
      expect(client.profiles).toBeDefined()
      expect(client.settings).toBeDefined()
      expect(client.refs).toBeDefined()
    })
  })

  describe('Type Definitions', () => {
    it('should validate LoginResult type', () => {
      const loginResult: Types.LoginResult = {
        tnId: 1,
        idTag: 'alice',
        token: 'jwt-token',
        name: 'Alice',
        profilePic: 'pic.jpg',
        roles: ['admin'],
        settings: [['theme', 'dark']],
      }

      expect(loginResult.idTag).toBe('alice')
      expect(loginResult.tnId).toBe(1)
    })

    it('should validate FileView type', () => {
      const file: Types.FileView = {
        fileId: 'file-1',
        status: 'P',
        contentType: 'image/jpeg',
        fileName: 'photo.jpg',
        createdAt: new Date(),
        tags: ['vacation'],
      }

      expect(file.fileId).toBe('file-1')
      expect(file.status).toBe('P')
    })

    it('should validate ActionView response', () => {
      // Note: ActionView is re-exported from @cloudillo/types
      // This test verifies the import works
      expect(Types.tActionView).toBeDefined()
    })

    it('should validate ListFilesResult type', () => {
      const result: Types.ListFilesResult = {
        files: [
          {
            fileId: 'f1',
            status: 'P',
            contentType: 'text/plain',
            fileName: 'test.txt',
            createdAt: new Date(),
          },
        ],
      }

      expect(result.files).toHaveLength(1)
      expect(result.files[0].fileId).toBe('f1')
    })
  })

  describe('Request Types', () => {
    it('should accept LoginRequest', () => {
      const req: Types.LoginRequest = {
        idTag: 'alice',
        password: 'secret',
      }

      expect(req.idTag).toBe('alice')
      expect(req.password).toBe('secret')
    })

    it('should accept CreateFileRequest', () => {
      const req: Types.CreateFileRequest = {
        fileTp: 'CRDT',
        contentType: 'application/json',
        tags: 'important,shared',
      }

      expect(req.fileTp).toBe('CRDT')
    })

    it('should accept ActionStatUpdate', () => {
      const update: Types.ActionStatUpdate = {
        reactions: 5,
        comments: 3,
      }

      expect(update.reactions).toBe(5)
      expect(update.comments).toBe(3)
    })

    it('should accept ReactionRequest', () => {
      const reaction: Types.ReactionRequest = {
        type: 'LOVE',
        content: 'emoji',
      }

      expect(reaction.type).toBe('LOVE')
    })

    it('should accept ProfilePatch', () => {
      const patch: Types.ProfilePatch = {
        name: 'Alice Smith',
        x: {
          category: 'Engineer',
          intro: 'Building things',
        },
      }

      expect(patch.name).toBe('Alice Smith')
    })
  })

  describe('Auth Endpoints', () => {
    it('should have login method', () => {
      expect(typeof client.auth.login).toBe('function')
    })

    it('should have logout method', () => {
      expect(typeof client.auth.logout).toBe('function')
    })

    it('should have getLoginToken method', () => {
      expect(typeof client.auth.getLoginToken).toBe('function')
    })

    it('should have getAccessToken method', () => {
      expect(typeof client.auth.getAccessToken).toBe('function')
    })

    it('should have getProxyToken method', () => {
      expect(typeof client.auth.getProxyToken).toBe('function')
    })

    it('should have changePassword method', () => {
      expect(typeof client.auth.changePassword).toBe('function')
    })
  })

  describe('Action Endpoints', () => {
    it('should have list method', () => {
      expect(typeof client.actions.list).toBe('function')
    })

    it('should have create method', () => {
      expect(typeof client.actions.create).toBe('function')
    })

    it('should have get method', () => {
      expect(typeof client.actions.get).toBe('function')
    })

    it('should have update method', () => {
      expect(typeof client.actions.update).toBe('function')
    })

    it('should have delete method', () => {
      expect(typeof client.actions.delete).toBe('function')
    })

    it('should have accept method', () => {
      expect(typeof client.actions.accept).toBe('function')
    })

    it('should have reject method', () => {
      expect(typeof client.actions.reject).toBe('function')
    })

    it('should have updateStat method', () => {
      expect(typeof client.actions.updateStat).toBe('function')
    })

    it('should have addReaction method', () => {
      expect(typeof client.actions.addReaction).toBe('function')
    })
  })

  describe('File Endpoints', () => {
    it('should have list method', () => {
      expect(typeof client.files.list).toBe('function')
    })

    it('should have create method', () => {
      expect(typeof client.files.create).toBe('function')
    })

    it('should have getVariant method', () => {
      expect(typeof client.files.getVariant).toBe('function')
    })

    it('should have getDescriptor method', () => {
      expect(typeof client.files.getDescriptor).toBe('function')
    })

    it('should have get method', () => {
      expect(typeof client.files.get).toBe('function')
    })

    it('should have update method', () => {
      expect(typeof client.files.update).toBe('function')
    })

    it('should have delete method', () => {
      expect(typeof client.files.delete).toBe('function')
    })

    it('should have addTag method', () => {
      expect(typeof client.files.addTag).toBe('function')
    })

    it('should have removeTag method', () => {
      expect(typeof client.files.removeTag).toBe('function')
    })
  })

  describe('Tag Endpoints', () => {
    it('should have list method', () => {
      expect(typeof client.tags.list).toBe('function')
    })
  })

  describe('Profile Endpoints', () => {
    it('should have getOwn method', () => {
      expect(typeof client.profiles.getOwn).toBe('function')
    })

    it('should have getOwnFull method', () => {
      expect(typeof client.profiles.getOwnFull).toBe('function')
    })

    it('should have updateOwn method', () => {
      expect(typeof client.profiles.updateOwn).toBe('function')
    })

    it('should have list method', () => {
      expect(typeof client.profiles.list).toBe('function')
    })

    it('should have get method', () => {
      expect(typeof client.profiles.get).toBe('function')
    })

    it('should have updateConnection method', () => {
      expect(typeof client.profiles.updateConnection).toBe('function')
    })
  })

  describe('Settings Endpoints', () => {
    it('should have list method', () => {
      expect(typeof client.settings.list).toBe('function')
    })

    it('should have get method', () => {
      expect(typeof client.settings.get).toBe('function')
    })

    it('should have update method', () => {
      expect(typeof client.settings.update).toBe('function')
    })
  })

  describe('Reference Endpoints', () => {
    it('should have list method', () => {
      expect(typeof client.refs.list).toBe('function')
    })

    it('should have create method', () => {
      expect(typeof client.refs.create).toBe('function')
    })

    it('should have delete method', () => {
      expect(typeof client.refs.delete).toBe('function')
    })
  })

  describe('Type Validators', () => {
    it('should have tLoginResult validator', () => {
      expect(Types.tLoginResult).toBeDefined()
    })

    it('should have tAccessTokenResult validator', () => {
      expect(Types.tAccessTokenResult).toBeDefined()
    })

    it('should have tFileView validator', () => {
      expect(Types.tFileView).toBeDefined()
    })

    it('should have tListFilesResult validator', () => {
      expect(Types.tListFilesResult).toBeDefined()
    })

    it('should have tActionView validator (re-exported)', () => {
      expect(Types.tActionView).toBeDefined()
    })

    it('should have tProfile validator (re-exported)', () => {
      expect(Types.tProfile).toBeDefined()
    })

    it('should have tReactionResponse validator', () => {
      expect(Types.tReactionResponse).toBeDefined()
    })

    it('should have tListActionsResult validator', () => {
      expect(Types.tListActionsResult).toBeDefined()
    })

    it('should have tListProfilesResult validator', () => {
      expect(Types.tListProfilesResult).toBeDefined()
    })

    it('should have tListTagsResult validator', () => {
      expect(Types.tListTagsResult).toBeDefined()
    })

    it('should have tRef validator', () => {
      expect(Types.tRef).toBeDefined()
    })
  })

  describe('Factory Function', () => {
    it('should create client instances', () => {
      const client1 = createApiClient({ idTag: 'user1' })
      const client2 = createApiClient({ idTag: 'user2' })

      expect(client1).not.toBe(client2)
      expect(client1).toBeInstanceOf(ApiClient)
      expect(client2).toBeInstanceOf(ApiClient)
    })
  })

  describe('Options Handling', () => {
    it('should accept idTag and authToken', () => {
      const testClient = createApiClient({
        idTag: 'alice',
        authToken: 'token123',
      })

      expect(testClient).toBeInstanceOf(ApiClient)
    })

    it('should accept idTag without authToken', () => {
      const testClient = createApiClient({
        idTag: 'alice',
      })

      expect(testClient).toBeInstanceOf(ApiClient)
    })
  })
})

describe('Type Validation', () => {
  describe('LoginResult', () => {
    it('should have required fields', () => {
      const result: Types.LoginResult = {
        tnId: 1,
        idTag: 'alice',
        token: 'token',
        name: 'Alice',
        profilePic: 'pic.jpg',
        roles: [],
        settings: [],
      }

      expect(result.tnId).toBeDefined()
      expect(result.idTag).toBeDefined()
      expect(result.token).toBeDefined()
    })
  })

  describe('FileView', () => {
    it('should allow optional fields', () => {
      const file: Types.FileView = {
        fileId: 'f1',
        status: 'P',
        contentType: 'text/plain',
        fileName: 'test.txt',
        createdAt: new Date(),
        // tags, x, owner are optional
      }

      expect(file.fileId).toBe('f1')
      expect(file.tags).toBeUndefined()
    })

    it('should allow owner information', () => {
      const file: Types.FileView = {
        fileId: 'f1',
        status: 'P',
        contentType: 'text/plain',
        fileName: 'test.txt',
        createdAt: new Date(),
        owner: {
          idTag: 'alice',
          name: 'Alice',
        },
      }

      expect(file.owner?.idTag).toBe('alice')
    })
  })

  describe('Runtype Validators', () => {
    it('tLoginResult should be a runtype validator', () => {
      // Validators have a decode method
      expect(typeof Types.tLoginResult.decode).toBe('function')
    })

    it('tFileView should be a runtype validator', () => {
      expect(typeof Types.tFileView.decode).toBe('function')
    })

    it('tListFilesResult should be a runtype validator', () => {
      expect(typeof Types.tListFilesResult.decode).toBe('function')
    })
  })
})

describe('Query Types', () => {
  it('should accept ListFilesQuery', () => {
    const query: Types.ListFilesQuery = {
      tag: 'vacation',
      preset: 'gallery',
      _limit: 50,
    }

    expect(query.tag).toBe('vacation')
  })

  it('should accept ListActionsQuery', () => {
    const query: Types.ListActionsQuery = {
      type: 'POST',
      _limit: 100,
    }

    expect(query.type).toBe('POST')
  })

  it('should accept ListProfilesQuery', () => {
    const query: Types.ListProfilesQuery = {
      type: 'person',
      connected: true,
    }

    expect(query.type).toBe('person')
  })

  it('should accept ListTagsQuery', () => {
    const query: Types.ListTagsQuery = {
      prefix: 'vaca',
    }

    expect(query.prefix).toBe('vaca')
  })

  it('should accept ListSettingsQuery', () => {
    const query: Types.ListSettingsQuery = {
      prefix: ['ui', 'display'],
    }

    expect(query.prefix).toEqual(['ui', 'display'])
  })
})

// vim: ts=2
