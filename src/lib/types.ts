export type Position =
  | 'FA'
  | 'ST'
  | 'BR'
  | 'SV'
  | 'GD'
  | 'PL'
  | 'RB'
  | 'DM'
  | 'BD'
  | 'RD'
  | 'CR'
  | 'CRA'

export interface Member {
  id: string
  name: string
  mbti?: string | null
  placement_connector?: boolean
  join_date: string
  country: string
  lv: number
  upline_id: string | null
  sponsor_id: string | null
}

export interface MonthlyReport {
  member_id: string
  month: string
  level: number
  highest_position: Position | string
  income_position: Position | string
  promotion_goal: string
  free_active_end_month: string | null
  monthly_bv: number
  is_active: boolean
  is_qualified: boolean
  left_highest_pos: Position | string
  right_highest_pos: Position | string
  total_vol_left: number
  total_vol_right: number
  prev_month_vol_left: number
  prev_month_vol_right: number
  current_month_vol_left: number
  current_month_vol_right: number
  deducted_vol_left: number
  deducted_vol_right: number
}

export interface MemberWithReport extends Member {
  report: MonthlyReport
}

export interface MonthlySummary {
  month: string
  total_members: number
  active_members: number
  qualified_members: number
  new_members: number
  position_counts: Record<string, number>
  total_bv: number
}

export const POSITION_RANK: Record<string, number> = {
  FA: 0,
  ST: 1,
  BR: 2,
  SV: 3,
  GD: 4,
  PL: 5,
  RB: 6,
  DM: 7,
  BD: 8,
  RD: 9,
  CR: 10,
  CRA: 11,
}

export const POSITION_LABEL: Record<string, string> = {
  FA: 'First Agent',
  ST: 'Star',
  BR: 'Bronze',
  SV: 'Silver',
  GD: 'Gold',
  PL: 'Platinum',
  RB: 'Ruby',
  DM: 'Diamond',
  BD: 'Blue Diamond',
  RD: 'Red Diamond',
  CR: 'Crown',
  CRA: 'Crown Ambassador',
}

export const POSITION_COLOR: Record<string, string> = {
  FA: '#94a3b8',
  ST: '#eab308',
  BR: '#f97316',
  SV: '#a855f7',
  GD: '#fbbf24',
  PL: '#e5e7eb',
  RB: '#ef4444',
  DM: '#22d3ee',
  BD: '#3b82f6',
  RD: '#dc2626',
  CR: '#f59e0b',
  CRA: '#facc15',
}
