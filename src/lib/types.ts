export type Position = 'FA' | 'BR' | 'ST' | 'SV'

export interface Member {
  id: string
  name: string
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
  highest_position: Position
  income_position: Position
  promotion_goal: string
  free_active_end_month: string
  monthly_bv: number
  is_active: boolean
  is_qualified: boolean
  left_highest_pos: string
  right_highest_pos: string
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
  position_counts: Record<Position, number>
  total_bv: number
}

export const POSITION_RANK: Record<Position, number> = {
  FA: 1,
  BR: 2,
  ST: 3,
  SV: 4,
}

export const POSITION_LABEL: Record<Position, string> = {
  FA: 'Founder Associate',
  BR: 'Bronze',
  ST: 'Star',
  SV: 'Silver',
}

export const POSITION_COLOR: Record<string, string> = {
  FA: '#94a3b8',
  BR: '#f97316',
  ST: '#eab308',
  SV: '#a855f7',
}
