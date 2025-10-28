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
import { apiFetchHelper } from './api.js'
import * as Types from './api-types.js'

/**
 * Options for creating an API client
 */
export interface ApiClientOpts {
  /** Authentication token (optional, can be provided per-request) */
  authToken?: string
  /** Identity tag of the tenant */
  idTag: string
}

/**
 * Type-safe API client for Cloudillo backend
 *
 * Provides strongly-typed methods for all API endpoints with automatic
 * response validation using runtype.
 *
 * @example
 * ```typescript
 * const api = createApiClient({
 *   idTag: 'alice',
 *   authToken: 'jwt-token'
 * })
 *
 * // Login
 * const result = await api.auth.login({
 *   idTag: 'alice',
 *   password: 'secret'
 * })
 *
 * // Create action
 * const action = await api.actions.create({
 *   type: 'POST',
 *   content: 'Hello world!'
 * })
 * ```
 */
export class ApiClient {
  private opts: ApiClientOpts

  constructor(opts: ApiClientOpts) {
    this.opts = opts
  }

  /**
   * Get the idTag of the tenant this API client is configured for
   */
  get idTag(): string {
    return this.opts.idTag
  }

  /**
   * Make a request with automatic response validation
   */
  async request<Res>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    responseType: T.Type<Res>,
    options?: {
      data?: unknown
      query?: Record<string, string | number | boolean | undefined>
      authToken?: string
    }
  ): Promise<Res> {
    return await apiFetchHelper<Res, unknown>(this.opts.idTag, method, path, {
      type: responseType,
      data: options?.data,
      query: options?.query,
      authToken: options?.authToken || this.opts.authToken,
    })
  }

  // ========================================================================
  // AUTH ENDPOINTS
  // ========================================================================

  /** Authentication endpoints */
  auth = {
    /**
     * POST /auth/login - User login with password
     * @param data - Login credentials
     * @returns Login result with token and profile info
     */
    login: (data: Types.LoginRequest) =>
      this.request('POST', '/auth/login', Types.tLoginResult, { data }),

    /**
     * POST /auth/logout - User logout
     */
    logout: () => this.request('POST', '/auth/logout', T.struct({})),

    /**
     * GET /auth/login-token - Get login token for current session
     * @returns Login result with token
     */
    getLoginToken: () =>
      this.request('GET', '/auth/login-token', Types.tLoginResult),

    /**
     * GET /auth/access-token - Get access token
     * @param query - Optional query parameters (subject, token)
     * @returns Token
     */
    getAccessToken: (query?: { subject?: string; token?: string }) =>
      this.request('GET', '/auth/access-token', Types.tAccessTokenResult, {
        query,
      }),

    /**
     * GET /auth/proxy-token - Get proxy token for federation
     * @returns Token
     */
    getProxyToken: () =>
      this.request('GET', '/auth/proxy-token', Types.tAccessTokenResult),

    /**
     * GET /auth/vapid - Get VAPID public key for push notifications
     * @returns VAPID public key
     */
    getVapidPublicKey: () =>
      this.request('GET', '/auth/vapid', Types.tGetVapidResult),

    /**
     * POST /auth/password - Change password
     * @param data - Password change request
     */
    changePassword: (data: Types.PasswordChangeRequest) =>
      this.request('POST', '/auth/password', T.struct({}), { data }),

    /**
     * POST /auth/register-verify - Verify registration information
     * @param data - Registration verify request
     * @returns Verification result with identity providers and validation errors
     */
    registerVerify: (data: Types.RegisterVerifyRequest) =>
      this.request('POST', '/auth/register-verify', Types.tRegisterVerifyResult, { data }),
  }

  // ========================================================================
  // ACTION ENDPOINTS
  // ========================================================================

  /** Action endpoints */
  actions = {
    /**
     * GET /action - List actions
     * @param query - Filter and pagination options
     * @returns List of actions
     */
    list: (query?: Types.ListActionsQuery) =>
      this.request('GET', '/action', Types.tListActionsResult, {
        query: query as any,
      }),

    /**
     * POST /action - Create action
     * @param data - Action data
     * @returns Created action
     */
    create: (data: Types.NewAction) =>
      this.request('POST', '/action', Types.tActionView, { data }),

    /**
     * GET /action/:actionId - Get single action
     * @param actionId - Action ID
     * @returns Action details
     */
    get: (actionId: string) =>
      this.request('GET', `/action/${actionId}`, Types.tActionView),

    /**
     * PATCH /action/:actionId - Update action (draft only)
     * @param actionId - Action ID
     * @param patch - Patch data
     * @returns Updated action
     */
    update: (actionId: string, patch: unknown) =>
      this.request('PATCH', `/action/${actionId}`, Types.tActionView, {
        data: patch,
      }),

    /**
     * DELETE /action/:actionId - Delete action
     * @param actionId - Action ID
     */
    delete: (actionId: string) =>
      this.request('DELETE', `/action/${actionId}`, T.struct({})),

    /**
     * POST /action/:actionId/accept - Accept action
     * @param actionId - Action ID
     */
    accept: (actionId: string) =>
      this.request('POST', `/action/${actionId}/accept`, T.struct({})),

    /**
     * POST /action/:actionId/reject - Reject action
     * @param actionId - Action ID
     */
    reject: (actionId: string) =>
      this.request('POST', `/action/${actionId}/reject`, T.struct({})),

    /**
     * POST /action/:actionId/stat - Update action statistics
     * @param actionId - Action ID
     * @param data - Statistics update
     */
    updateStat: (actionId: string, data: Types.ActionStatUpdate) =>
      this.request('POST', `/action/${actionId}/stat`, T.struct({}), {
        data,
      }),

    /**
     * POST /action/:actionId/reaction - Add reaction to action
     * @param actionId - Action ID
     * @param data - Reaction data
     * @returns Reaction ID
     */
    addReaction: (actionId: string, data: Types.ReactionRequest) =>
      this.request(
        'POST',
        `/action/${actionId}/reaction`,
        Types.tReactionResponse,
        { data }
      ),
  }

  // ========================================================================
  // FILE ENDPOINTS
  // ========================================================================

  /** File endpoints */
  files = {
    /**
     * GET /file - List files
     * @param query - Filter and pagination options
     * @returns List of files
     */
    list: (query?: Types.ListFilesQuery) =>
      this.request('GET', '/file', Types.tListFilesResult, {
        query: query as any,
      }),

    /**
     * POST /file - Create file (metadata-only: CRDT, RTDB, etc.)
     * @param data - File creation request
     * @returns Created file ID
     */
    create: (data: Types.CreateFileRequest) =>
      this.request('POST', '/file', Types.tCreateFileResult, { data }),

    /**
     * GET /file/variant/:variantId - Get specific file variant
     * @param variantId - Variant ID
     * @returns Binary file data
     */
    getVariant: (variantId: string) =>
      fetch(`https://cl-o.${this.opts.idTag}/api/file/variant/${variantId}`, {
        headers: {
          Authorization: `Bearer ${this.opts.authToken}`,
        },
      }),

    /**
     * GET /file/:fileId/descriptor - Get file descriptor and variants
     * @param fileId - File ID
     * @returns File descriptor
     */
    getDescriptor: (fileId: string) =>
      this.request('GET', `/file/${fileId}/descriptor`, Types.tFileDescriptor),

    /**
     * GET /file/:fileId - Get file (best variant selected)
     * @param fileId - File ID
     * @param selector - Optional variant selector
     * @returns Binary file data
     */
    get: (fileId: string, selector?: Types.GetFileVariantSelector) => {
      const query = selector
        ? Object.entries(selector).reduce(
            (acc, [key, val]) => {
              if (val !== undefined) acc[key] = String(val)
              return acc
            },
            {} as Record<string, string>
          )
        : undefined

      return fetch(`https://cl-o.${this.opts.idTag}/api/file/${fileId}`, {
        headers: {
          Authorization: `Bearer ${this.opts.authToken}`,
        },
      })
    },

    /**
     * PATCH /file/:fileId - Update file metadata
     * @param fileId - File ID
     * @param data - Patch data
     * @returns Updated file data
     */
    update: (fileId: string, data: Types.PatchFileRequest) =>
      this.request('PATCH', `/file/${fileId}`, Types.tPatchFileResult, {
        data,
      }),

    /**
     * DELETE /file/:fileId - Delete file
     * @param fileId - File ID
     * @returns Deleted file ID
     */
    delete: (fileId: string) =>
      this.request('DELETE', `/file/${fileId}`, Types.tDeleteFileResult),

    /**
     * PUT /file/:fileId/tag/:tag - Add tag to file
     * @param fileId - File ID
     * @param tag - Tag name
     * @returns File tags
     */
    addTag: (fileId: string, tag: string) =>
      this.request('PUT', `/file/${fileId}/tag/${tag}`, Types.tTagResult),

    /**
     * DELETE /file/:fileId/tag/:tag - Remove tag from file
     * @param fileId - File ID
     * @param tag - Tag name
     * @returns File tags
     */
    removeTag: (fileId: string, tag: string) =>
      this.request('DELETE', `/file/${fileId}/tag/${tag}`, Types.tTagResult),
  }

  // ========================================================================
  // TAG ENDPOINTS
  // ========================================================================

  /** Tag endpoints */
  tags = {
    /**
     * GET /tag - List tags
     * @param query - Optional prefix filter
     * @returns List of tags
     */
    list: (query?: { prefix?: string }) =>
      this.request('GET', '/tag', Types.tListTagsResult, { query }),
  }

  // ========================================================================
  // PROFILE ENDPOINTS
  // ========================================================================

  /** Profile endpoints */
  profiles = {
    /**
     * GET /me - Get own profile
     * @returns Own profile with keys
     */
    getOwn: () => this.request('GET', '/me', Types.tProfileKeys),

    /**
     * GET /me/full - Get full own profile
     * @returns Full own profile
     */
    getOwnFull: () => this.request('GET', '/me/full', Types.tProfileKeys),

    /**
     * PATCH /me - Update own profile
     * @param data - Profile patch
     * @returns Updated profile
     */
    updateOwn: (data: Types.ProfilePatch) =>
      this.request('PATCH', '/me', Types.tUpdateProfileResult, { data }),

    /**
     * GET /profile - List profiles
     * @param query - Filter options
     * @returns List of profiles
     */
    list: (query?: Types.ListProfilesQuery) =>
      this.request('GET', '/profile', Types.tListProfilesResult, {
        query: query as any,
      }),

    /**
     * GET /profile/:idTag - Get profile by ID tag
     * @param idTag - Identity tag
     * @returns Profile
     */
    get: (idTag: string) =>
      this.request('GET', `/profile/${idTag}`, Types.tProfile),

    /**
     * PATCH /profile/:idTag - Update profile connection/relationship
     * @param idTag - Identity tag
     * @param data - Patch data
     */
    updateConnection: (idTag: string, data: Types.PatchProfileConnection) =>
      this.request('PATCH', `/profile/${idTag}`, T.struct({}), { data }),
  }

  // ========================================================================
  // SETTINGS ENDPOINTS
  // ========================================================================

  /** Settings endpoints */
  settings = {
    /**
     * GET /settings - List settings
     * @param query - Optional prefix filter
     * @returns Settings
     */
    list: (query?: { prefix?: string }) =>
      this.request('GET', '/settings', Types.tListSettingsResult, { query }),

    /**
     * GET /settings/:name - Get single setting
     * @param name - Setting name
     * @returns Setting value
     */
    get: (name: string) =>
      this.request('GET', `/settings/${name}`, Types.tGetSettingResult),

    /**
     * PUT /settings/:name - Update setting
     * @param name - Setting name
     * @param data - Setting value object
     */
    update: (name: string, data: { value: unknown }) =>
      this.request('PUT', `/settings/${name}`, T.struct({}), { data }),
  }

  // ========================================================================
  // NOTIFICATION ENDPOINTS
  // ========================================================================

  /** Notification endpoints */
  notifications = {
    /**
     * POST /notification/subscription - Subscribe to push notifications
     * @param data - Push subscription object
     */
    subscribe: (data: { subscription: PushSubscription }) =>
      this.request('POST', '/notification/subscription', T.struct({}), { data }),
  }

  // ========================================================================
  // REFERENCE ENDPOINTS
  // ========================================================================

  /** Reference endpoints */
  refs = {
    /**
     * GET /ref - List references
     * @param query - Optional type filter
     * @returns List of references
     */
    list: (query?: { type?: string }) =>
      this.request('GET', '/ref', T.array(Types.tRef), { query }),

    /**
     * POST /ref - Create reference
     * @param data - Reference creation request
     * @returns Created reference
     */
    create: (data: Types.CreateRefRequest) =>
      this.request('POST', '/ref', Types.tRef, { data }),

    /**
     * DELETE /ref/:refId - Delete reference
     * @param refId - Reference ID
     * @returns Deleted reference ID
     */
    delete: (refId: string) =>
      this.request('DELETE', `/ref/${refId}`, Types.tDeleteRefResult),
  }
}

/**
 * Factory function to create an API client
 *
 * @param opts - Client options (idTag and optional authToken)
 * @returns API client instance
 *
 * @example
 * ```typescript
 * const api = createApiClient({
 *   idTag: 'alice',
 *   authToken: 'jwt-token'
 * })
 * ```
 */
export function createApiClient(opts: ApiClientOpts): ApiClient {
  return new ApiClient(opts)
}

// vim: ts=2
