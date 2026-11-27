/**
 * Store listing copy that is not a description: names, subtitles, keywords
 * and Play short descriptions.
 *
 * Plain ESM rather than TypeScript so the Descriptions view and the node tests
 * read the same strings. The tests hold the store limits and the keyword rules.
 *
 * Most of it is keyed by our locale, which fans out to several store locales
 * (`storeLocales.mjs`). The overrides at the bottom are the store locales that
 * must not get the shared copy, because a storefront searches them for a
 * different audience or because they are written in another script.
 */

/**
 * The name the app is registered under, 29 characters, inside the 30 both
 * stores allow. It is sent on every full upload, so it has to match what is
 * live: a different string here renames the app in every listing locale.
 */
export const APP_NAME = 'RiceCal: Asia Calorie Tracker';

/** The App Store subtitle, 30 characters at most. */
export const SUBTITLES = {
  en:  'Calorie & Workout Tracker',
  ms:  'Penjejak Kalori & Senaman',
  zh:  '热量与健身记录',
  id:  'Pelacak Kalori & Latihan',
  th:  'แคลอรีและการออกกำลังกาย',
  vi:  'Theo dõi calo & tập luyện',
  ja:  'カロリー＆筋トレ記録',
  ko:  '칼로리 & 운동 기록',
  hi:  'कैलोरी और वर्कआउट ट्रैकर',
  ta:  'கலோரி & உடற்பயிற்சி',
  bn:  'ক্যালোরি ও ওয়ার্কআউট',
  fil: 'Calorie at Workout Tracker',
  es:  'Calorías y entrenamientos',
  fr:  'Calories et entraînement',
  de:  'Kalorien- & Trainingstracker',
  pt:  'Calorias e treinos',
  it:  'Calorie e allenamenti',
  nl:  'Calorieën en training',
  ru:  'Калории и тренировки',
  tr:  'Kalori ve Antrenman Takibi',
  pl:  'Kalorie i treningi',
  uk:  'Калорії та тренування',
  sv:  'Kalorier och träning',
  nb:  'Kalorier og trening',
  da:  'Kalorier og træning',
};

/**
 * App Store keywords: 100 characters, comma separated, no spaces after the
 * commas. Apple searches the name, the subtitle and this field as one pool, so
 * a word already in the name or the subtitle is wasted here.
 *
 * `ms` carries Chinese words on purpose. Malaysia's storefront searches only
 * the Malay and English (U.K.) fields, so the Simplified Chinese field never
 * reaches the Chinese speakers there, while almost no phone shows the Malay
 * listing. Before this, RiceCal did not rank in Malaysia for 卡路里 or 热量
 * at all, and ranked #60 and #32 for them in Singapore, which does search
 * Simplified Chinese.
 */
export const KEYWORDS = {
  en:  'counter,food,diary,macro,nutrition,barcode,recipe,asian,ai,photo,scan,diet,weight,loss,protein,gym',
  ms:  '卡路里,热量,减肥,减脂,饮食,记录,食物,营养,健身,拍照,makanan,diet,kurus,berat,badan,nasi,lemak,resipi,barkod,makro,gim',
  zh:  '卡路里,饮食,营养,减肥,减脂,体重,食谱,亚洲,拍照,识别,食物,计算,马来西亚,大马,新加坡,美食,蛋白质,宏量,条码,训练,打卡,日记,AI,低卡,瘦身,椰浆饭,经济饭,炒粿条,肉骨茶,海南鸡饭',
  id:  'kalori,makanan,catatan,makro,pelacak,nutrisi,barcode,resep,asia,berat,latihan,gym',
  th:  'แคลอรี,อาหาร,บันทึก,มาโคร,ติดตาม,โภชนาการ,บาร์โค้ด,สูตร,เอเชีย,น้ำหนัก,ออกกำลังกาย,ฟิตเนส',
  vi:  'calo,thuc pham,nhat ky,macro,theo doi,dinh duong,ma vach,cong thuc,chau a,tap luyen,gym',
  ja:  'カロリー,食事,記録,マクロ,栄養,バーコード,レシピ,アジア,体重,ダイエット,筋トレ,ワークアウト',
  ko:  '칼로리,식단,기록,매크로,영양,바코드,레시피,아시아,체중,다이어트,운동,헬스',
  hi:  'कैलोरी,भोजन,डायरी,मैक्रो,ट्रैकर,पोषण,बारकोड,रेसिपी,एशिया,वज़न,वर्कआउट,जिम',
  ta:  'கலோரி,உணவு,எடை,ஆசிய,பார்கோடு,உடற்பயிற்சி,ஜிம்',
  bn:  'ক্যালোরি,খাবার,ওজন,এশীয়,বারকোড,ওয়ার্কআউট,জিম',
  fil: 'calorie,pagkain,diary,macro,tracker,nutrisyon,barcode,recipe,asya,timbang,workout,gym',
  es:  'calorias,contador,comida,diario,macros,nutricion,codigo,receta,asiatica,entrenamiento,gym',
  fr:  'calories,compteur,repas,journal,macros,nutrition,code barres,recette,asie,musculation,sport',
  de:  'kalorien,zaehler,essen,tagebuch,makros,ernaehrung,barcode,rezept,asien,training,fitness',
  pt:  'calorias,contador,comida,diario,macros,nutricao,codigo,receita,asiatica,treino,academia',
  it:  'calorie,contatore,cibo,diario,macro,nutrizione,codice,ricetta,asiatica,allenamento,palestra',
  nl:  'calorieen,teller,eten,dagboek,macros,voeding,streepjescode,recept,azie,training,sportschool',
  ru:  'калории,счетчик,еда,дневник,макросы,питание,штрихкод,рецепт,азия,вес,тренировки,спортзал',
  tr:  'kalori,sayac,yemek,gunluk,makro,beslenme,barkod,tarif,asya,kilo,antrenman,spor',
  pl:  'kalorie,licznik,jedzenie,dziennik,makro,zywienie,kod kreskowy,przepis,azja,trening,silownia',
  uk:  'калорії,лічильник,їжа,щоденник,макроси,харчування,штрихкод,рецепт,азія,тренування,спортзал',
  sv:  'kalorier,raknare,mat,dagbok,makros,naring,streckkod,recept,asiatisk,vikt,traning,gym',
  nb:  'kalorier,teller,mat,dagbok,makroer,ernaering,strekkode,oppskrift,asiatisk,trening,treningssenter',
  da:  'kalorier,taeller,mad,dagbog,makroer,ernaering,stregkode,opskrift,asiatisk,traening,fitness',
};

/**
 * Play's short description, 80 characters at most. Play has no keyword field,
 * so after the title this is the text its search reads most. A language
 * missing here falls back to its App Store subtitle.
 */
export const PLAY_SHORT_DESCRIPTIONS = {
  en: 'AI calorie counter for Asian food: snap a plate, scan barcodes, log workouts',
  ms: 'Kira kalori makanan Asia: ambil gambar, imbas barkod, rekod senaman',
  zh: '拍照识别亚洲美食热量，记录饮食、体重和健身。椰浆饭、经济饭、炒粿条都认得',
};

const TRADITIONAL_SUBTITLE = '熱量與健身記錄';
const TRADITIONAL_PLAY_NAME = 'RiceCal: 亞洲美食熱量記錄';
const TRADITIONAL_PLAY_SHORT = '拍照辨識亞洲美食熱量，記錄飲食、體重和健身。椰漿飯、經濟飯、炒粿條都認得';

/**
 * App Store locales that differ from the language they are uploaded with.
 *
 * - `en-GB` is the English listing Malaysia, Singapore and Hong Kong search, so
 *   it names the region and its dishes; `en-US`, `en-AU` and `en-CA` keep `en`.
 * - `zh-Hant` was getting the Simplified subtitle and keywords, so Taiwan and
 *   Hong Kong searches for 熱量 never matched.
 */
export const IOS_STORE_OVERRIDES = {
  'en-GB': {
    keywords: 'counter,food,diary,macro,barcode,ai,photo,scan,diet,weight,loss,malaysia,singapore,hawker,nasi,lemak',
  },
  'zh-Hant': {
    subtitle: TRADITIONAL_SUBTITLE,
    keywords: '卡路里,飲食,營養,減肥,減脂,體重,食譜,亞洲,拍照,識別,食物,計算,馬來西亞,大馬,新加坡,香港,台灣,美食,蛋白質,條碼,訓練,打卡,日記,AI,低卡,瘦身,椰漿飯,經濟飯,炒粿條,肉骨茶',
  },
};

/**
 * Play locales that differ from the language they are uploaded with. The
 * Chinese listings carry a Chinese title, which Play searches before anything
 * else, and Traditional Chinese gets its own script.
 */
export const ANDROID_STORE_OVERRIDES = {
  'zh-CN': { name: 'RiceCal: 亚洲美食热量记录' },
  'zh-TW': { name: TRADITIONAL_PLAY_NAME, shortDescription: TRADITIONAL_PLAY_SHORT },
  'zh-HK': { name: TRADITIONAL_PLAY_NAME, shortDescription: TRADITIONAL_PLAY_SHORT },
};
