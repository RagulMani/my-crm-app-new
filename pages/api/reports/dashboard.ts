import type { NextApiRequest, NextApiResponse } from 'next';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-helpers';
import type { DashboardStats, LeadsByStage, TasksDueSummary, RecentActivity, ApiError } from '@/lib/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ stats: DashboardStats } | ApiError>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user;
  try {
    user = await requireUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  try {
    // Build scope filter for sales_rep
    const isSalesRep = user.role === 'sales_rep';

    // ── Leads by stage ───────────────────────────────────────────────────────
    const leadsByStageRows = await query<{ status: string; count: string; total_value: string }>(
      `SELECT
         status,
         COUNT(*)::text AS count,
         COALESCE(SUM(value), 0)::text AS total_value
       FROM leads
       ${isSalesRep ? 'WHERE owner_id = $1' : ''}
       GROUP BY status
       ORDER BY status`,
      isSalesRep ? [user.id] : []
    );

    const leads_by_stage: LeadsByStage[] = leadsByStageRows.map((r) => ({
      status: r.status as LeadsByStage['status'],
      count: parseInt(r.count, 10),
      total_value: parseFloat(r.total_value),
    }));

    // ── Tasks summary ────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const taskScope = isSalesRep ? 'AND assignee_id = $1' : '';
    const taskParams = isSalesRep ? [user.id] : [];

    const [overdueRows, todayRows, weekRows, openRows] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tasks
         WHERE due_date < $${isSalesRep ? 2 : 1} AND status <> 'done' ${taskScope}`,
        isSalesRep ? [user.id, now] : [now]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tasks
         WHERE due_date BETWEEN $${isSalesRep ? 2 : 1} AND $${isSalesRep ? 3 : 2}
           AND status <> 'done' ${taskScope}`,
        isSalesRep
          ? [user.id, now, endOfToday.toISOString()]
          : [now, endOfToday.toISOString()]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tasks
         WHERE due_date BETWEEN $${isSalesRep ? 2 : 1} AND $${isSalesRep ? 3 : 2}
           AND status <> 'done' ${taskScope}`,
        isSalesRep
          ? [user.id, now, endOfWeek.toISOString()]
          : [now, endOfWeek.toISOString()]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tasks
         WHERE status <> 'done' ${taskScope}`,
        taskParams
      ),
    ]);

    const tasks_summary: TasksDueSummary = {
      overdue: parseInt(overdueRows[0]?.count ?? '0', 10),
      due_today: parseInt(todayRows[0]?.count ?? '0', 10),
      due_this_week: parseInt(weekRows[0]?.count ?? '0', 10),
      open_total: parseInt(openRows[0]?.count ?? '0', 10),
    };

    // ── Recent activities ────────────────────────────────────────────────────
    const recent_activities = await query<RecentActivity>(
      `SELECT a.*, u.name AS user_name
       FROM activities a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 10`
    );

    // ── Totals ───────────────────────────────────────────────────────────────
    const [contactsRow, companiesRow, leadsRow, wonRow] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM contacts ${isSalesRep ? 'WHERE owner_id = $1' : ''}`,
        isSalesRep ? [user.id] : []
      ),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM companies'),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM leads ${isSalesRep ? 'WHERE owner_id = $1' : ''}`,
        isSalesRep ? [user.id] : []
      ),
      query<{ total: string }>(
        `SELECT COALESCE(SUM(value), 0)::text AS total FROM leads
         WHERE status = 'won' ${isSalesRep ? 'AND owner_id = $1' : ''}`,
        isSalesRep ? [user.id] : []
      ),
    ]);

    const stats: DashboardStats = {
      leads_by_stage,
      tasks_summary,
      recent_activities,
      total_contacts: parseInt(contactsRow[0]?.count ?? '0', 10),
      total_companies: parseInt(companiesRow[0]?.count ?? '0', 10),
      total_leads: parseInt(leadsRow[0]?.count ?? '0', 10),
      won_leads_value: parseFloat(wonRow[0]?.total ?? '0'),
    };

    return res.status(200).json({ stats });
  } catch (err) {
    console.error('[GET /api/reports/dashboard]', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
}
