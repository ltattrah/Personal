import type { NextRequest } from 'next/server';

export type AdminRole = 'editor' | 'reviewer' | 'publisher' | 'admin';

export interface AdminIdentity {
  id: string;
  email: string;
  roles: AdminRole[];
}

/**
 * Admin authentication.
 *  - demo mode: shared token in `x-admin-token` (or ?token=) compared to ADMIN_TOKEN.
 *  - full mode: Supabase JWT in Authorization: Bearer; roles come from the
 *    `admin_users` table (see migration). RLS enforces the same roles at the
 *    database layer so API bugs cannot bypass them.
 */
export async function authenticateAdmin(req: NextRequest): Promise<AdminIdentity | null> {
  if (process.env.GHANAVOICE_MODE === 'full') {
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    const { getServiceClient } = await import('@/lib/db/supabase');
    const db = getServiceClient();
    const { data: userData, error } = await db.auth.getUser(auth.slice(7));
    if (error || !userData.user) return null;
    const { data: row } = await db.from('admin_users').select('roles').eq('user_id', userData.user.id).maybeSingle();
    if (!row) return null;
    return { id: userData.user.id, email: userData.user.email ?? '', roles: row.roles as AdminRole[] };
  }
  const token = req.headers.get('x-admin-token') ?? req.nextUrl.searchParams.get('token');
  const expected = process.env.ADMIN_TOKEN ?? 'change-me';
  if (!token || token !== expected) return null;
  return { id: 'demo-admin', email: 'admin@demo.local', roles: ['editor', 'reviewer', 'publisher', 'admin'] };
}

export function hasRole(identity: AdminIdentity, role: AdminRole) {
  return identity.roles.includes(role) || identity.roles.includes('admin');
}

/**
 * Publishing workflow transitions. Separation of duties: the person who
 * submits for review cannot approve their own submission (enforced in the
 * route by comparing actors in the audit trail), and publishing requires the
 * publisher role.
 */
export const TRANSITIONS: Record<string, { to: string; role: AdminRole }[]> = {
  draft: [{ to: 'in_review', role: 'editor' }],
  in_review: [
    { to: 'approved', role: 'reviewer' },
    { to: 'draft', role: 'reviewer' },
  ],
  approved: [
    { to: 'published', role: 'publisher' },
    { to: 'draft', role: 'reviewer' },
  ],
  published: [
    { to: 'retired', role: 'publisher' },
    { to: 'draft', role: 'editor' },
  ],
  retired: [{ to: 'draft', role: 'editor' }],
};

export function canTransition(from: string, to: string, identity: AdminIdentity): boolean {
  return (TRANSITIONS[from] ?? []).some((t) => t.to === to && hasRole(identity, t.role));
}
