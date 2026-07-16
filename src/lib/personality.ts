export type PersonalityAxis = 'energy' | 'information' | 'decision' | 'execution' | 'pressure'
export type Visibility = 'private' | 'coach' | 'team'

export interface AssessmentQuestion {
  id: string
  axis: PersonalityAxis
  direction: 1 | -1
  text: string
}

export interface PersonalityScores {
  energy: number
  information: number
  decision: number
  execution: number
  pressure: number
}

export interface LeadershipProfileResult {
  scores: PersonalityScores
  approximateType: string
  coreType: string
  identity: 'A' | 'T'
  leadershipStyle: string
  confidence: number
  strengths: string[]
  risks: string[]
  coachingTips: string[]
  growthSkills: string[]
}

export interface StoredPersonalityProfile extends LeadershipProfileResult {
  version: 1
  memberId: string
  visibility: Visibility
  consentGiven: true
  assessedAt: string
}

export const RESPONSE_OPTIONS = [
  { value: 1, label: 'ไม่ตรงกับฉันเลย' },
  { value: 2, label: 'ค่อนข้างไม่ตรง' },
  { value: 3, label: 'ขึ้นอยู่กับสถานการณ์' },
  { value: 4, label: 'ค่อนข้างตรง' },
  { value: 5, label: 'ตรงกับฉันมาก' },
] as const

export const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  { id: 'E01', axis: 'energy', direction: 1, text: 'เมื่ออยู่ในกิจกรรมที่มีคนจำนวนมาก ฉันมักมีพลังและอยากมีส่วนร่วมมากขึ้น' },
  { id: 'E02', axis: 'energy', direction: -1, text: 'ก่อนพูดในที่ประชุม ฉันต้องการเวลาคิดและเรียบเรียงความคิดตามลำพัง' },
  { id: 'E03', axis: 'energy', direction: 1, text: 'ฉันมักเข้าใจความคิดของตนเองชัดขึ้นเมื่อได้พูดคุยกับผู้อื่น' },
  { id: 'E04', axis: 'energy', direction: -1, text: 'หลังทำงานร่วมกับคนต่อเนื่องหลายชั่วโมง ฉันต้องการเวลาเงียบ ๆ เพื่อฟื้นพลัง' },
  { id: 'E05', axis: 'energy', direction: 1, text: 'การเริ่มบทสนทนากับคนที่ยังไม่รู้จักเป็นสิ่งที่ฉันทำได้ค่อนข้างเป็นธรรมชาติ' },
  { id: 'E06', axis: 'energy', direction: -1, text: 'ฉันชอบการสนทนาแบบตัวต่อตัวมากกว่าการอยู่กลางวงสนทนาใหญ่' },
  { id: 'E07', axis: 'energy', direction: 1, text: 'เมื่อทีมเงียบ ฉันมักเป็นคนเริ่มสร้างบรรยากาศหรือชวนให้ทุกคนพูด' },
  { id: 'E08', axis: 'energy', direction: -1, text: 'ฉันทำงานได้ดีที่สุดเมื่อมีช่วงเวลาที่ไม่มีใครรบกวน' },
  { id: 'E09', axis: 'energy', direction: 1, text: 'ฉันพร้อมทดลองลงมือกับผู้อื่น แม้ยังไม่ได้คิดรายละเอียดครบทุกด้าน' },
  { id: 'E10', axis: 'energy', direction: -1, text: 'ฉันมักสังเกตและฟังบรรยากาศก่อนเลือกว่าจะเข้าไปมีส่วนร่วมอย่างไร' },

  { id: 'N01', axis: 'information', direction: 1, text: 'เมื่อเรียนรู้เรื่องใหม่ ฉันสนใจภาพใหญ่และความเป็นไปได้ในอนาคตก่อนรายละเอียด' },
  { id: 'N02', axis: 'information', direction: -1, text: 'ฉันเข้าใจงานได้ดีที่สุดเมื่อมีตัวอย่างจริงและขั้นตอนที่ชัดเจน' },
  { id: 'N03', axis: 'information', direction: 1, text: 'ฉันมักเชื่อมโยงเหตุการณ์หลายเรื่องเข้าด้วยกันเพื่อมองหาแนวโน้มระยะยาว' },
  { id: 'N04', axis: 'information', direction: -1, text: 'ฉันให้ความสำคัญกับสิ่งที่พิสูจน์แล้วว่านำไปใช้ได้จริงมากกว่าแนวคิดที่ยังไม่เคยลอง' },
  { id: 'N05', axis: 'information', direction: 1, text: 'ฉันรู้สึกตื่นเต้นเมื่อได้คิดวิธีใหม่ที่แตกต่างจากแนวทางเดิม' },
  { id: 'N06', axis: 'information', direction: -1, text: 'ก่อนตัดสินใจ ฉันต้องการข้อมูลเฉพาะเจาะจงมากกว่าคำอธิบายเชิงแนวคิด' },
  { id: 'N07', axis: 'information', direction: 1, text: 'ฉันมักมองเห็นศักยภาพของคนหรือโครงการก่อนที่จะมีผลลัพธ์ชัดเจน' },
  { id: 'N08', axis: 'information', direction: -1, text: 'ฉันชอบปรับปรุงระบบที่มีอยู่ทีละขั้นมากกว่ารื้อแล้วสร้างใหม่ทั้งหมด' },
  { id: 'N09', axis: 'information', direction: 1, text: 'ฉันมักถามว่า “สิ่งนี้จะพาเราไปถึงไหน” มากกว่า “วันนี้ต้องทำอะไรบ้าง”' },
  { id: 'N10', axis: 'information', direction: -1, text: 'ฉันจดจำรายละเอียดจากประสบการณ์จริงได้ดีกว่าทฤษฎีหรือแนวคิดนามธรรม' },

  { id: 'T01', axis: 'decision', direction: 1, text: 'เมื่อต้องตัดสินใจเรื่องยาก ฉันให้ความสำคัญกับหลักเกณฑ์เดียวกันสำหรับทุกคน' },
  { id: 'T02', axis: 'decision', direction: -1, text: 'ก่อนให้ Feedback ฉันมักคิดก่อนว่าอีกฝ่ายจะรับฟังอย่างไร' },
  { id: 'T03', axis: 'decision', direction: 1, text: 'ฉันสามารถแยกความสัมพันธ์ส่วนตัวออกจากการประเมินผลงานได้ค่อนข้างชัดเจน' },
  { id: 'T04', axis: 'decision', direction: -1, text: 'เมื่อทีมขัดแย้งกัน ฉันมักพยายามให้ทุกฝ่ายรู้สึกว่าได้รับการรับฟัง' },
  { id: 'T05', axis: 'decision', direction: 1, text: 'ฉันสบายใจกับการตั้งคำถามตรง ๆ เมื่อเห็นว่าเหตุผลหรือข้อมูลยังไม่เพียงพอ' },
  { id: 'T06', axis: 'decision', direction: -1, text: 'ฉันมักตัดสินใจโดยพิจารณาว่าทางเลือกใดสอดคล้องกับคุณค่าและผู้คนมากที่สุด' },
  { id: 'T07', axis: 'decision', direction: 1, text: 'ฉันต้องการให้ข้อเสนอมีเหตุผลและหลักฐานรองรับ แม้จะเป็นแนวคิดที่ทุกคนชอบ' },
  { id: 'T08', axis: 'decision', direction: -1, text: 'การรักษาความไว้วางใจระยะยาวอาจสำคัญกว่าการได้ผลลัพธ์ที่ดีที่สุดในทันที' },
  { id: 'T09', axis: 'decision', direction: 1, text: 'ฉันยอมรับการโต้แย้งอย่างตรงไปตรงมาได้ หากช่วยให้ได้ข้อสรุปที่ดีขึ้น' },
  { id: 'T10', axis: 'decision', direction: -1, text: 'ฉันมักสังเกตอารมณ์และบรรยากาศของทีมก่อนพูดเรื่องที่อาจกระทบความรู้สึก' },

  { id: 'J01', axis: 'execution', direction: 1, text: 'ฉันทำงานได้ดีขึ้นเมื่อเป้าหมาย วันเวลา และผู้รับผิดชอบถูกกำหนดชัดเจน' },
  { id: 'J02', axis: 'execution', direction: -1, text: 'ฉันชอบเปิดทางเลือกไว้หลายทางจนกว่าจะเห็นสถานการณ์จริงมากขึ้น' },
  { id: 'J03', axis: 'execution', direction: 1, text: 'เมื่อได้รับงาน ฉันมักแบ่งเป็นขั้นตอนและกำหนดเวลาปิดงาน' },
  { id: 'J04', axis: 'execution', direction: -1, text: 'ฉันมักได้ไอเดียหรือวิธีทำที่ดีที่สุดระหว่างลงมือ มากกว่าจากการวางแผนล่วงหน้า' },
  { id: 'J05', axis: 'execution', direction: 1, text: 'งานที่ยังไม่มีข้อสรุปหรือกำหนดส่งทำให้ฉันรู้สึกว่าต้องรีบจัดระเบียบ' },
  { id: 'J06', axis: 'execution', direction: -1, text: 'ฉันปรับเปลี่ยนแผนได้ง่ายเมื่อพบโอกาสใหม่ที่น่าสนใจกว่า' },
  { id: 'J07', axis: 'execution', direction: 1, text: 'ฉันชอบปิดงานหนึ่งให้เรียบร้อยก่อนเริ่มงานสำคัญชิ้นต่อไป' },
  { id: 'J08', axis: 'execution', direction: -1, text: 'ฉันรู้สึกมีพลังเมื่อได้ทำงานหลายเรื่องสลับกันตามจังหวะและความเร่งด่วน' },
  { id: 'J09', axis: 'execution', direction: 1, text: 'ฉันมักติดตามสิ่งที่รับปากไว้โดยไม่ต้องให้คนอื่นเตือน' },
  { id: 'J10', axis: 'execution', direction: -1, text: 'ฉันให้ความสำคัญกับอิสระในการเลือกวิธีทำ มากกว่าการทำตามขั้นตอนที่กำหนดไว้' },

  { id: 'A01', axis: 'pressure', direction: 1, text: 'เมื่อผลงานไม่เป็นไปตามเป้าหมาย ฉันสามารถตั้งหลักและเดินหน้าต่อได้ค่อนข้างเร็ว' },
  { id: 'A02', axis: 'pressure', direction: -1, text: 'หลังเหตุการณ์สำคัญ ฉันมักย้อนคิดว่าตนเองน่าจะทำอะไรได้ดีกว่านี้' },
  { id: 'A03', axis: 'pressure', direction: 1, text: 'ฉันกล้าตัดสินใจแม้จะรู้ว่ายังไม่มีข้อมูลครบทุกด้าน' },
  { id: 'A04', axis: 'pressure', direction: -1, text: 'ความคิดเห็นเชิงลบจากคนที่ฉันให้ความสำคัญอาจอยู่ในความคิดของฉันนาน' },
  { id: 'A05', axis: 'pressure', direction: 1, text: 'เมื่อเผชิญแรงกดดัน ฉันยังสามารถสื่อสารและจัดลำดับความสำคัญได้ดี' },
  { id: 'A06', axis: 'pressure', direction: -1, text: 'ฉันมักตั้งมาตรฐานให้ตนเองสูงและรู้สึกไม่สบายใจเมื่อผลงานยังไม่ถึงระดับนั้น' },
  { id: 'A07', axis: 'pressure', direction: 1, text: 'ความผิดพลาดหนึ่งครั้งไม่ทำให้ฉันสงสัยในความสามารถโดยรวมของตนเองมากนัก' },
  { id: 'A08', axis: 'pressure', direction: -1, text: 'ก่อนเหตุการณ์สำคัญ ฉันมักคิดถึงสิ่งที่อาจผิดพลาดและเตรียมรับมือหลายทาง' },
  { id: 'A09', axis: 'pressure', direction: 1, text: 'ฉันสามารถรับ Feedback ตรง ๆ แล้วเลือกสิ่งที่เป็นประโยชน์ไปใช้ได้โดยไม่เสียสมาธินาน' },
  { id: 'A10', axis: 'pressure', direction: -1, text: 'เมื่อเห็นคนอื่นก้าวหน้าเร็วกว่า ฉันมักใช้สิ่งนั้นเป็นแรงผลักให้ตนเองปรับปรุงมากขึ้น' },
]

const STYLE_TITLES: Record<string, string> = {
  ISTJ: 'System Builder', ISFJ: 'Community Steward', INFJ: 'Purpose Mentor', INTJ: 'Strategic Architect',
  ISTP: 'Practical Problem Solver', ISFP: 'Values Supporter', INFP: 'Meaning Creator', INTP: 'Systems Explorer',
  ESTP: 'Momentum Activator', ESFP: 'Community Energizer', ENFP: 'Possibility Connector', ENTP: 'Innovation Challenger',
  ESTJ: 'Execution Leader', ESFJ: 'Engagement Leader', ENFJ: 'Leadership Developer', ENTJ: 'Strategic Driver',
}

const STYLE_SUMMARIES: Record<string, string> = {
  ISTJ: 'สร้างความมั่นคงด้วยมาตรฐาน ความรับผิดชอบ และระบบที่ทำซ้ำได้',
  ISFJ: 'ดูแลรายละเอียดและความสัมพันธ์ ทำให้สมาชิกได้รับการติดตามอย่างต่อเนื่อง',
  INFJ: 'เชื่อมเป้าหมายกับความหมาย และมองเห็นศักยภาพเชิงลึกของผู้คน',
  INTJ: 'ออกแบบทิศทางระยะยาวและปรับระบบให้มีประสิทธิภาพมากขึ้น',
  ISTP: 'แก้ปัญหาหน้างานอย่างเป็นเหตุเป็นผลและทดลองวิธีที่ใช้ได้จริง',
  ISFP: 'สร้างพื้นที่ที่จริงใจ ยืดหยุ่น และเคารพคุณค่าของแต่ละคน',
  INFP: 'ปลุกแรงบันดาลใจผ่านคุณค่า เรื่องราว และความหมายที่แท้จริง',
  INTP: 'ตั้งคำถามกับสมมติฐานและสร้างความเข้าใจระบบที่ลึกขึ้น',
  ESTP: 'เร่ง Momentum ด้วยการลงมือเร็ว การสื่อสารตรง และการปรับตัวหน้างาน',
  ESFP: 'สร้างพลัง การมีส่วนร่วม และประสบการณ์ที่ทำให้คนอยากกลับมา',
  ENFP: 'เชื่อมผู้คนกับความเป็นไปได้ใหม่และปลุกความกล้าในการเริ่มต้น',
  ENTP: 'ท้าทายวิธีเดิม ทดลองโมเดลใหม่ และมองหาโอกาสที่คนอื่นยังไม่เห็น',
  ESTJ: 'เปลี่ยนเป้าหมายเป็นมาตรฐาน แผนงาน และผลลัพธ์ที่ตรวจสอบได้',
  ESFJ: 'สร้างความผูกพันและประสานให้ผู้คนทำงานร่วมกันอย่างต่อเนื่อง',
  ENFJ: 'สื่อสารวิสัยทัศน์และพัฒนาคนให้เติบโตเป็นผู้นำ',
  ENTJ: 'กำหนดทิศทาง ตัดสินใจ และขับเคลื่อนทีมไปสู่ผลลัพธ์ที่ใหญ่ขึ้น',
}

const AXIS_CONTENT = {
  energy: {
    high: { strength: 'สร้างพลังและเริ่มปฏิสัมพันธ์กับผู้คนได้รวดเร็ว', risk: 'อาจคิดออกเสียงเร็วจนคนที่ต้องใช้เวลาประมวลผลตามไม่ทัน', coach: 'ใช้การสนทนา การลงสนาม และกิจกรรมร่วมเป็นเครื่องมือเรียนรู้', growth: 'ฝึกฟังให้จบและเว้นช่วงให้ผู้อื่นได้คิดก่อนตอบ' },
    low: { strength: 'ฟังลึก สังเกตรายละเอียดของคน และเตรียมความคิดอย่างรอบคอบ', risk: 'อาจเก็บความคิดดีไว้กับตนเองหรือชะลอการเริ่มต้นนานเกินไป', coach: 'ส่งข้อมูลล่วงหน้า ใช้การคุยตัวต่อตัว และให้เวลาคิดก่อนตัดสินใจ', growth: 'ฝึกสื่อสารต่อกลุ่มและเริ่มบทสนทนาก่อนรู้สึกพร้อมสมบูรณ์' },
  },
  information: {
    high: { strength: 'มองภาพใหญ่ เชื่อมโยงแนวโน้ม และเห็นความเป็นไปได้ใหม่', risk: 'อาจข้ามรายละเอียดหรือเปลี่ยนแนวคิดก่อนระบบเดิมเกิดผลเต็มที่', coach: 'เริ่มจาก Why วิสัยทัศน์ และผลกระทบระยะยาวก่อนลงรายละเอียด', growth: 'ฝึกใช้ Checklist ตัวเลข และหลักฐานหน้างานประกอบทุกแผน' },
    low: { strength: 'เข้าใจข้อเท็จจริง ขั้นตอน และสิ่งที่นำไปใช้ได้จริง', risk: 'อาจยึดวิธีที่พิสูจน์แล้วจนพลาดโอกาสจากแนวคิดใหม่', coach: 'ใช้ตัวอย่างจริง สาธิต และแบ่งเป็นขั้นตอนที่วัดผลได้', growth: 'ฝึกมองแนวโน้มระยะยาวและถามถึงความเป็นไปได้ที่ยังไม่เคยทดลอง' },
  },
  decision: {
    high: { strength: 'ใช้เหตุผล มาตรฐาน และข้อมูลในการตัดสินใจอย่างชัดเจน', risk: 'อาจให้ Feedback ตรงจนอีกฝ่ายรับสารไม่ครบหรือรู้สึกไม่ได้รับการเข้าใจ', coach: 'อธิบายเหตุผล เกณฑ์วัด และผลลัพธ์ที่ต้องการอย่างตรงไปตรงมา', growth: 'ฝึกถามความรู้สึกและผลกระทบต่อคนก่อนเสนอทางแก้' },
    low: { strength: 'เข้าใจผู้คน สร้างความไว้วางใจ และคำนึงถึงผลกระทบต่อความสัมพันธ์', risk: 'อาจหลีกเลี่ยงบทสนทนายากหรือยืดเวลาตัดสินใจเพื่อรักษาความรู้สึก', coach: 'เชื่อมงานกับคุณค่า ให้ Feedback เป็นส่วนตัว และรับฟังก่อนกำหนดแผน', growth: 'ฝึกตั้งมาตรฐาน พูดข้อเท็จจริง และขอ Commitment ที่ชัดเจน' },
  },
  execution: {
    high: { strength: 'วางแผน ปิดงาน และรักษาความต่อเนื่องของระบบได้ดี', risk: 'อาจเร่งข้อสรุปหรือยึดแผนเดิมเมื่อสถานการณ์ต้องการความยืดหยุ่น', coach: 'กำหนดเป้าหมาย Owner Deadline และจุด Review ให้ชัด', growth: 'ฝึกเปิดทางเลือกและทดลองวิธีใหม่โดยไม่ต้องควบคุมทุกขั้นตอน' },
    low: { strength: 'ยืดหยุ่น ทดลองเร็ว และปรับแผนตามสถานการณ์ได้ดี', risk: 'อาจเริ่มหลายอย่างแต่ติดตามหรือปิดงานไม่ครบ', coach: 'ให้เลือกวิธีทำเอง แต่ใช้ Sprint สั้นและ Checkpoint ที่แน่นอน', growth: 'ฝึกปิดงานตามกำหนด บันทึกสิ่งที่รับปาก และลดงานที่เปิดค้าง' },
  },
  pressure: {
    high: { strength: 'ตั้งหลักและรักษาความมั่นใจได้ดีเมื่อเผชิญแรงกดดัน', risk: 'อาจมองข้ามสัญญาณเตือนหรือไม่ทบทวนข้อผิดพลาดอย่างเพียงพอ', coach: 'ให้โจทย์ท้าทาย Feedback ตรง และความรับผิดชอบที่ชัด', growth: 'ฝึกทบทวนผลลัพธ์และเปิดรับรายละเอียดที่ขัดกับความเชื่อมั่นเดิม' },
    low: { strength: 'ตรวจสอบตนเองละเอียด มีแรงผลักในการพัฒนา และเตรียมความเสี่ยงได้ดี', risk: 'อาจวิจารณ์ตนเองมากเกินไปหรือเสียพลังกับความผิดพลาดเล็กน้อย', coach: 'แบ่งเป้าหมายเป็นขั้นเล็ก ลดความคลุมเครือ และให้ Feedback อย่างเป็นส่วนตัว', growth: 'ฝึกแยกมาตรฐานสูงออกจากการตำหนิตนเอง และฉลองความก้าวหน้าระหว่างทาง' },
  },
} as const

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function scoreAssessment(answers: Record<string, number>): LeadershipProfileResult {
  const totals: Record<PersonalityAxis, number[]> = { energy: [], information: [], decision: [], execution: [], pressure: [] }

  for (const question of ASSESSMENT_QUESTIONS) {
    const raw = answers[question.id]
    if (!Number.isInteger(raw) || raw < 1 || raw > 5) throw new Error(`Invalid answer for ${question.id}`)
    const normalized = ((raw - 1) / 4) * 100
    totals[question.axis].push(question.direction === 1 ? normalized : 100 - normalized)
  }

  const scores = Object.fromEntries(Object.entries(totals).map(([axis, values]) => [
    axis,
    roundScore(values.reduce((sum, value) => sum + value, 0) / values.length),
  ])) as unknown as PersonalityScores

  const coreType = [
    scores.energy >= 50 ? 'E' : 'I',
    scores.information >= 50 ? 'N' : 'S',
    scores.decision >= 50 ? 'T' : 'F',
    scores.execution >= 50 ? 'J' : 'P',
  ].join('')
  const identity: 'A' | 'T' = scores.pressure >= 50 ? 'A' : 'T'
  const approximateType = `${coreType}-${identity}`
  const confidence = roundScore(Object.values(scores).reduce((sum, score) => sum + Math.abs(score - 50) * 2, 0) / 5)
  const axes: PersonalityAxis[] = ['energy', 'information', 'decision', 'execution', 'pressure']

  return {
    scores,
    approximateType,
    coreType,
    identity,
    leadershipStyle: confidence < 20 ? 'Adaptive Leader' : (STYLE_TITLES[coreType] ?? 'Adaptive Leader'),
    confidence,
    strengths: axes.map(axis => AXIS_CONTENT[axis][scores[axis] >= 50 ? 'high' : 'low'].strength),
    risks: axes.map(axis => AXIS_CONTENT[axis][scores[axis] >= 50 ? 'high' : 'low'].risk),
    coachingTips: axes.map(axis => AXIS_CONTENT[axis][scores[axis] >= 50 ? 'high' : 'low'].coach),
    growthSkills: axes.map(axis => AXIS_CONTENT[axis][scores[axis] >= 50 ? 'high' : 'low'].growth),
  }
}

export function getLeadershipSummary(coreType: string): string {
  return STYLE_SUMMARIES[coreType] ?? 'ใช้จุดแข็งตามธรรมชาติและพัฒนาทักษะที่สถานการณ์ต้องการ'
}

export function formatPersonalityForCoach(profile: StoredPersonalityProfile): string {
  const s = profile.scores
  return `=== FIRST COMMUNITY LEADERSHIP PROFILE ===
รูปแบบใกล้เคียง: ${profile.approximateType}
Leadership Style: ${profile.leadershipStyle}
ความชัดของแนวโน้ม: ${profile.confidence}%
คะแนนแกนต่อเนื่อง:
- Social Energy: ${s.energy}/100 (ต่ำ=Reflective, สูง=Interactive)
- Information Style: ${s.information}/100 (ต่ำ=Practical, สูง=Visionary)
- Decision Style: ${s.decision}/100 (ต่ำ=Relational, สูง=Analytical)
- Execution Style: ${s.execution}/100 (ต่ำ=Adaptive, สูง=Structured)
- Pressure Response: ${s.pressure}/100 (ต่ำ=Improvement-focused, สูง=Steady)

จุดแข็งที่ควรใช้:
${profile.strengths.map(item => `- ${item}`).join('\n')}

ทักษะที่ควรฝึก:
${profile.growthSkills.map(item => `- ${item}`).join('\n')}

กติกาการใช้ข้อมูลบุคลิกภาพ:
- ใช้เพื่อปรับวิธีสื่อสาร การเรียนรู้ และการพัฒนาผู้นำเท่านั้น
- ห้ามสรุปศักยภาพ ความซื่อสัตย์ หรือความสำเร็จจากประเภทบุคลิกภาพ
- ใช้คำว่า “มีแนวโน้ม” และพิจารณา KPI พฤติกรรมจริง และบริบทควบคู่เสมอ
- เมื่อคะแนนอยู่ช่วง 45–55 ให้ถือว่าเจ้าตัวปรับใช้ได้ทั้งสองด้าน`
}
