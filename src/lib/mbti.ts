export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const

export type MbtiType = (typeof MBTI_TYPES)[number]

export function isMbtiType(value: string): value is MbtiType {
  return MBTI_TYPES.includes(value as MbtiType)
}
