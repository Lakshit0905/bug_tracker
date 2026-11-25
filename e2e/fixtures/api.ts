import { request, type APIRequestContext } from '@playwright/test'
import { E2E } from '../data/env'
import type { Account } from '../data/users'

/**
 * Thin API client for arranging data and asserting server state. Tests drive behaviour through the UI and
 * use this to set up preconditions quickly and to check what actually reached the database.
 */
export class Api {
  private constructor(
    private readonly ctx: APIRequestContext,
    readonly token: string,
    readonly refreshToken: string,
    readonly userId: number,
  ) {}

  static async login(account: Account): Promise<Api> {
    const ctx = await request.newContext({ baseURL: `${E2E.apiBase}/` })
    const res = await ctx.post('auth/login', { data: { email: account.email, password: account.password } })
    if (!res.ok()) throw new Error(`API login failed for ${account.email}: ${res.status()} ${await res.text()}`)
    const body = await res.json()
    return new Api(ctx, body.access_token, body.refresh_token, body.user.id)
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` }
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    const res = await this.ctx.get(path, { headers: this.headers(), params })
    if (!res.ok()) throw new Error(`GET ${path} → ${res.status()} ${await res.text()}`)
    return res.json()
  }

  async send<T>(method: 'post' | 'put' | 'patch', path: string, data?: unknown): Promise<T> {
    const res = await this.ctx[method](path, { headers: this.headers(), data })
    if (!res.ok()) throw new Error(`${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`)
    return res.status() === 204 ? (undefined as T) : res.json()
  }

  createBug(overrides: Record<string, unknown> = {}) {
    return this.send<{ id: number; key: string; title: string }>('post', 'bugs', {
      title: 'E2E arranged bug',
      description: 'Created through the API to arrange a test precondition.',
      severity: 'MEDIUM',
      category: 'UI',
      steps_to_reproduce: '1. Open the page',
      expected_result: 'It works',
      actual_result: 'It does not',
      ...overrides,
    })
  }

  async upload(bugId: number, file: { name: string; mimeType: string; buffer: Buffer }) {
    const res = await this.ctx.post(`bugs/${bugId}/attachments`, { headers: this.headers(), multipart: { file } })
    if (!res.ok()) throw new Error(`upload → ${res.status()} ${await res.text()}`)
    return res.json()
  }

  findUserId = async (email: string) =>
    (await this.get<{ items: { id: number; email: string }[] }>('users', { q: email })).items.find((u) => u.email === email)!.id

  dispose = () => this.ctx.dispose()
}
