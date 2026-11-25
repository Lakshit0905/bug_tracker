/** Accounts created by global-setup (backend/scripts/seed_demo.py + seed_admin.py). */
export interface Account {
  email: string
  password: string
  name: string
  role: 'TESTER' | 'DEVELOPER' | 'PROJECT_MANAGER' | 'ADMIN'
}

const DEMO = 'Demo12345'

export const USERS = {
  pm: { email: 'priya.patel@demo.bugtrackr.dev', password: DEMO, name: 'Priya Patel', role: 'PROJECT_MANAGER' },
  tester: { email: 'tina.torres@demo.bugtrackr.dev', password: DEMO, name: 'Tina Torres', role: 'TESTER' },
  tester2: { email: 'sam.okafor@demo.bugtrackr.dev', password: DEMO, name: 'Sam Okafor', role: 'TESTER' },
  dev: { email: 'raj.mehta@demo.bugtrackr.dev', password: DEMO, name: 'Raj Mehta', role: 'DEVELOPER' },
  dev2: { email: 'lena.fischer@demo.bugtrackr.dev', password: DEMO, name: 'Lena Fischer', role: 'DEVELOPER' },
  admin: { email: 'admin@bugtrackr.dev', password: 'Admin12345', name: 'Ada Admin', role: 'ADMIN' },
} satisfies Record<string, Account>

/** Unique, readable test data so tests never depend on each other's records. */
export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}
