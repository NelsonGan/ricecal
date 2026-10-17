// These are display fixtures, not a food composition reference.
// Names and portions belong to the market, independently of the app language.
const dish = (name, carbs, protein, fat, grams = 350, icon = 'rice-bowl') => ({
  name,
  carbs,
  protein,
  fat,
  grams,
  icon,
  kcal: Math.round(carbs * 4 + protein * 4 + fat * 9),
})
export const MARKETS = {
  MY: [
    dish('Nasi lemak', 64, 23, 24, 350, 'nasi-lemak'),
    dish('Roti canai', 48, 10, 17, 180, 'roti-canai'),
    dish('Laksa nyonya', 56, 24, 18, 420, 'laksa'),
    dish('Char kuey teow', 65, 23, 20, 350, 'char-kuey-teow'),
    dish('Satay ayam', 18, 32, 20, 220, 'satay'),
    dish('Nasi kerabu', 62, 25, 16, 370, 'nasi-kerabu'),
  ],
  ID: [
    dish('Nasi goreng', 68, 25, 18, 350, 'nasi-goreng'),
    dish('Gado-gado', 36, 18, 20, 320, 'gado-gado'),
    dish('Soto ayam', 40, 30, 12, 400, 'soto'),
    dish('Rendang', 14, 34, 25, 220, 'rendang'),
    dish('Sate ayam', 18, 32, 20, 220, 'satay'),
    dish('Bakso', 45, 24, 12, 400, 'meatball-noodles'),
  ],
  TH: [
    dish('ผัดไทย', 65, 24, 18, 350, 'pad-thai'),
    dish('ข้าวผัด', 67, 22, 17, 350, 'nasi-goreng'),
    dish('ต้มยำกุ้ง', 18, 28, 12, 400, 'tomyam'),
    dish('แกงเขียวหวาน', 22, 28, 24, 320, 'green-curry'),
    dish('ส้มตำ', 24, 8, 9, 250, 'salad'),
    dish('ข้าวเหนียวมะม่วง', 65, 6, 12, 220, 'mango-sticky-rice'),
  ],
  VN: [
    dish('Phở bò', 56, 30, 12, 450, 'pho'),
    dish('Bánh mì', 55, 24, 15, 220, 'sandwich'),
    dish('Gỏi cuốn', 36, 18, 8, 220, 'spring-rolls'),
    dish('Bún chả', 55, 28, 17, 350, 'noodle-bowl'),
    dish('Bánh xèo', 42, 20, 18, 280, 'pancakes'),
    dish('Cơm tấm', 62, 30, 18, 370, 'plate-rice'),
  ],
  PH: [
    dish('Chicken adobo', 12, 35, 19, 250, 'roast-chicken'),
    dish('Sinigang', 18, 28, 14, 420, 'soup'),
    dish('Pancit bihon', 60, 22, 14, 350, 'noodle-bowl'),
    dish('Lumpia', 36, 16, 17, 200, 'spring-rolls'),
    dish('Arroz caldo', 48, 25, 10, 400, 'porridge'),
    dish('Kare-kare', 24, 30, 24, 320, 'rendang'),
  ],
  JP: [
    dish('鮭おにぎり', 54, 14, 6, 210, 'onigiri'),
    dish('親子丼', 70, 32, 15, 380, 'rice-bowl'),
    dish('ざるそば', 52, 18, 5, 300, 'soba'),
    dish('焼き餃子', 35, 20, 15, 220, 'dumplings'),
    dish('ちらし寿司', 60, 28, 10, 300, 'sushi'),
    dish('お好み焼き', 48, 23, 18, 300, 'pancakes'),
  ],
  KR: [
    dish('비빔밥', 65, 25, 16, 380, 'bibimbap'),
    dish('김밥', 58, 20, 12, 280, 'sushi'),
    dish('불고기', 24, 35, 18, 260, 'beef'),
    dish('잡채', 55, 15, 13, 300, 'noodle-bowl'),
    dish('김치찌개', 18, 25, 14, 400, 'soup'),
    dish('떡볶이', 70, 12, 7, 300, 'tteokbokki'),
  ],
  IN: [
    dish('पोहा', 48, 10, 12, 250, 'plate-rice'),
    dish('दाल चावल', 65, 22, 12, 380, 'dhal'),
    dish('पालक पनीर', 18, 25, 22, 280, 'palak-paneer'),
    dish('चना मसाला', 45, 20, 12, 300, 'chickpeas'),
    dish('चिकन बिरयानी', 70, 15, 16, 350, 'nasi-briyani'),
    dish('आलू पराठा', 52, 12, 17, 230, 'chapati'),
  ],
  IN_TA: [
    dish('இட்லி', 46, 12, 5, 240, 'idli'),
    dish('தோசை', 55, 13, 12, 250, 'dosa'),
    dish('சாம்பார் சாதம்', 60, 18, 10, 350, 'dhal'),
    dish('பொங்கல்', 52, 12, 14, 280, 'porridge'),
    dish('தயிர் சாதம்', 50, 14, 8, 300, 'plate-rice'),
    dish('சிக்கன் பிரியாணி', 65, 28, 18, 350, 'nasi-briyani'),
  ],
  BD: [
    dish('খিচুড়ি', 62, 20, 12, 350, 'plate-rice'),
    dish('বোয়াল মাছের ঝোল', 14, 32, 15, 300, 'fish-curry'),
    dish('ডাল ও রুটি', 65, 22, 12, 380, 'dhal'),
    dish('সবজি তেহারি', 68, 30, 18, 350, 'nasi-briyani'),
    dish('আলু পরোটা', 35, 6, 10, 220, 'potato'),
    dish('পাবদার ঝাল', 8, 30, 16, 200, 'fish'),
  ],
}
export const LOCALES = {
  en: {
    market: 'MY',
    region: 'MY',
    portion: 'plate',
    describe: 'Nasi lemak with an egg and sambal',
  },
  'zh-Hans': {
    market: 'MY',
    region: 'MY',
    portion: '盘',
    names: ['椰浆饭', '印度煎饼', '娘惹叻沙', '炒粿条', '鸡肉沙爹', '蓝花饭'],
    describe: '一份椰浆饭，加鸡蛋和参巴',
  },
  'zh-Hant': {
    market: 'MY',
    region: 'MY',
    portion: '盤',
    names: ['椰漿飯', '印度煎餅', '娘惹叻沙', '炒粿條', '雞肉沙爹', '藍花飯'],
    describe: '一份椰漿飯，加雞蛋和參巴',
  },
  ms: {
    market: 'MY',
    region: 'MY',
    portion: 'pinggan',
    describe: 'Nasi lemak dengan telur dan sambal',
  },
  id: {
    market: 'ID',
    region: 'ID',
    portion: 'porsi',
    describe: 'Nasi goreng dengan telur dan ayam',
  },
  th: { market: 'TH', region: 'TH', portion: 'จาน', describe: 'ผัดไทยกุ้งหนึ่งจาน' },
  vi: { market: 'VN', region: 'VN', portion: 'tô', describe: 'Một tô phở bò với rau thơm' },
  fil: { market: 'PH', region: 'PH', portion: 'plato', describe: 'Chicken adobo na may kanin' },
  ja: { market: 'JP', region: 'JP', portion: '人前', describe: '鮭おにぎりと味噌汁' },
  ko: { market: 'KR', region: 'KR', portion: '인분', describe: '달걀을 올린 비빔밥 한 그릇' },
  hi: { market: 'IN', region: 'IN', portion: 'प्लेट', describe: 'दाल चावल और सलाद की एक प्लेट' },
  ta: { market: 'IN_TA', region: 'IN', portion: 'பரிமாறல்', describe: 'சாம்பாருடன் மூன்று இட்லி' },
  bn: { market: 'BD', region: 'BD', portion: 'প্লেট', describe: 'এক প্লেট খিচুড়ি ও সবজি' },
}
export const SHOTS = [
  ['01-today', '/today'],
  ['02-describe', '/log?panel=describe'],
  ['03-dish', '/log/food/'],
  ['04-trends', '/trends'],
  ['05-feed', '/feed'],
  ['06-recipes', '/settings/foods'],
]
export function dishesFor(locale) {
  const config = LOCALES[locale]
  if (!config) throw new Error(`Unsupported screenshot locale: ${locale}`)
  return MARKETS[config.market].map((food, index) => ({
    ...food,
    name: config.names?.[index] ?? food.name,
    photo: `${config.market.toLowerCase()}-${index + 1}.jpg`,
    portion: config.portion,
  }))
}
