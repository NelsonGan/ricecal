/**
 * Push copy, in each recipient's own language. The app's strings live on the
 * phone, and a push is written before the phone is awake, so the few words a
 * push needs are carried here. Keep them as short as the app's.
 */
type Meal = 'breakfast' | 'lunch' | 'dinner'
type Copy = {
  nudge: (name: string) => string
  nudgeBody: (meal: string, group: string) => string
  invite: (name: string) => string
  inviteBody: (group: string) => string
  meals: Record<Meal, string>
}

const COPY: Record<string, Copy> = {
  en: {
    nudge: (n) => `${n} nudged you 👋`,
    nudgeBody: (m, g) => `Log your ${m} for ${g}.`,
    invite: (n) => `${n} invited you to a group`,
    inviteBody: (g) => `Join ${g} on RiceCal.`,
    meals: { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner' },
  },
  ms: {
    nudge: (n) => `${n} mencuit anda 👋`,
    nudgeBody: (m, g) => `Catat ${m} anda untuk ${g}.`,
    invite: (n) => `${n} menjemput anda ke kumpulan`,
    inviteBody: (g) => `Sertai ${g} di RiceCal.`,
    meals: { breakfast: 'sarapan', lunch: 'makan tengah hari', dinner: 'makan malam' },
  },
  'zh-Hans': {
    nudge: (n) => `${n} 提醒了你 👋`,
    nudgeBody: (m, g) => `记录你的${m}，${g} 在等你。`,
    invite: (n) => `${n} 邀请你加入小组`,
    inviteBody: (g) => `在 RiceCal 加入 ${g}。`,
    meals: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' },
  },
  'zh-Hant': {
    nudge: (n) => `${n} 提醒了你 👋`,
    nudgeBody: (m, g) => `記錄你的${m}，${g} 在等你。`,
    invite: (n) => `${n} 邀請你加入小組`,
    inviteBody: (g) => `在 RiceCal 加入 ${g}。`,
    meals: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' },
  },
  id: {
    nudge: (n) => `${n} mencolek kamu 👋`,
    nudgeBody: (m, g) => `Catat ${m} kamu untuk ${g}.`,
    invite: (n) => `${n} mengundangmu ke grup`,
    inviteBody: (g) => `Gabung ${g} di RiceCal.`,
    meals: { breakfast: 'sarapan', lunch: 'makan siang', dinner: 'makan malam' },
  },
  th: {
    nudge: (n) => `${n} สะกิดคุณ 👋`,
    nudgeBody: (m, g) => `บันทึก${m}ของคุณให้ ${g}`,
    invite: (n) => `${n} ชวนคุณเข้ากลุ่ม`,
    inviteBody: (g) => `เข้าร่วม ${g} ใน RiceCal`,
    meals: { breakfast: 'มื้อเช้า', lunch: 'มื้อกลางวัน', dinner: 'มื้อเย็น' },
  },
  vi: {
    nudge: (n) => `${n} đã nhắc bạn 👋`,
    nudgeBody: (m, g) => `Ghi lại bữa ${m} cho ${g}.`,
    invite: (n) => `${n} mời bạn vào nhóm`,
    inviteBody: (g) => `Tham gia ${g} trên RiceCal.`,
    meals: { breakfast: 'sáng', lunch: 'trưa', dinner: 'tối' },
  },
  fil: {
    nudge: (n) => `Kinalabit ka ni ${n} 👋`,
    nudgeBody: (m, g) => `I-log ang iyong ${m} para sa ${g}.`,
    invite: (n) => `Inimbitahan ka ni ${n} sa isang grupo`,
    inviteBody: (g) => `Sumali sa ${g} sa RiceCal.`,
    meals: { breakfast: 'almusal', lunch: 'tanghalian', dinner: 'hapunan' },
  },
  ja: {
    nudge: (n) => `${n}さんがつついています 👋`,
    nudgeBody: (m, g) => `${g}に${m}を記録しましょう。`,
    invite: (n) => `${n}さんからグループへの招待`,
    inviteBody: (g) => `RiceCalで${g}に参加しましょう。`,
    meals: { breakfast: '朝食', lunch: '昼食', dinner: '夕食' },
  },
  ko: {
    nudge: (n) => `${n}님이 콕 찔렀어요 👋`,
    nudgeBody: (m, g) => `${g}에 ${m}을 기록하세요.`,
    invite: (n) => `${n}님이 그룹에 초대했어요`,
    inviteBody: (g) => `RiceCal에서 ${g}에 참여하세요.`,
    meals: { breakfast: '아침', lunch: '점심', dinner: '저녁' },
  },
  hi: {
    nudge: (n) => `${n} ने आपको याद दिलाया 👋`,
    nudgeBody: (m, g) => `${g} के लिए अपना ${m} दर्ज करें।`,
    invite: (n) => `${n} ने आपको समूह में बुलाया`,
    inviteBody: (g) => `RiceCal पर ${g} से जुड़ें।`,
    meals: { breakfast: 'नाश्ता', lunch: 'दोपहर का खाना', dinner: 'रात का खाना' },
  },
  ta: {
    nudge: (n) => `${n} உங்களை நினைவூட்டினார் 👋`,
    nudgeBody: (m, g) => `${g} க்காக உங்கள் ${m} பதிவு செய்யுங்கள்.`,
    invite: (n) => `${n} உங்களை குழுவுக்கு அழைத்தார்`,
    inviteBody: (g) => `RiceCal இல் ${g} இல் சேருங்கள்.`,
    meals: { breakfast: 'காலை உணவு', lunch: 'மதிய உணவு', dinner: 'இரவு உணவு' },
  },
  bn: {
    nudge: (n) => `${n} আপনাকে মনে করিয়ে দিলেন 👋`,
    nudgeBody: (m, g) => `${g} এর জন্য আপনার ${m} লিখুন।`,
    invite: (n) => `${n} আপনাকে একটি গ্রুপে আমন্ত্রণ জানিয়েছেন`,
    inviteBody: (g) => `RiceCal এ ${g} এ যোগ দিন।`,
    meals: { breakfast: 'সকালের খাবার', lunch: 'দুপুরের খাবার', dinner: 'রাতের খাবার' },
  },
}

export type PushTarget = {
  token: string
  language: string
  actor_name: string | null
  group_name: string
  group_id: string
  day: string | null
  meal: Meal | null
}

export function pushMessage(kind: 'nudge' | 'invite', target: PushTarget) {
  const copy = COPY[target.language] ?? COPY.en
  // A missing name gets a word rather than a blank.
  const name = target.actor_name?.trim() || 'RiceCal'
  const title = kind === 'nudge' ? copy.nudge(name) : copy.invite(name)
  const body =
    kind === 'nudge'
      ? copy.nudgeBody(copy.meals[target.meal ?? 'lunch'], target.group_name)
      : copy.inviteBody(target.group_name)
  return {
    to: target.token,
    title,
    body,
    sound: 'default',
    data: { kind: 'group', groupId: target.group_id, day: target.day, invite: kind === 'invite' },
  }
}
