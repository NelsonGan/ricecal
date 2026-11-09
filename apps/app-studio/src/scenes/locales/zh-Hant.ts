import type { LocaleModule } from './types';

const zhHant: LocaleModule = {
  meta: { code: 'zh-Hant', flag: '🇲🇾', label: '繁體中文', badge: 'MY' },
  phone: {
    today: { h: '每一餐\n都算得清', hl: '都算得清', sub: '一個圓環看今天還剩多少，旁邊就是三大營養素和喝水。' },
    workout: {
      h: '每組都記下，\n刷新個人紀錄',
      hl: '刷新個人紀錄',
      sub: '每組旁邊都有上次的成績，超越就有獎盃。',
    },
    dish: { h: '選好份量，\n數字自己來', hl: '數字自己來', sub: '碗、盤還是塊都行。換個份量，數字跟著變。' },
    trends: { h: '這一週\n都吃到哪去了', hl: '都吃到哪去了', sub: '七天、三十天或一年。熱量、喝水和體重。' },
    feed: {
      h: '分享餐點，\n認識同好',
      hl: '認識同好',
      sub: '追蹤朋友，分享你喜歡的美食。',
    },
    recipes: { h: '做一次，\n以後一點就好', hl: '以後一點就好', sub: '寫清用了什麼、夠幾個人吃。之後一點即可。' },
    panel: {
      title: '五種方式\n記亞洲菜', sub: '小販攤、家常菜，還有店裡的包裝食品。',
      stats: { usersChoice: '2K 用戶之選' },
      metrics: { calories: '熱量', water: '喝水', weight: '體重' },
      snap: { t: '拍一張盤子', b: '盤裡每道菜都被認出、估量並算清。' },
      describe: { t: '說出你吃了什麼', b: '「椰漿飯配炸雞，再一杯拉茶。」' },
      scan: { t: '掃包裝條碼', b: '直接讀標籤，一秒出結果。' },
      search: { t: '搜尋食物資料庫', b: '小販攤、連鎖店和家常菜都有。' },
      recipes: { t: '存下你的食譜', b: '寫一次，以後一點就記好。' },
    },
  },
  feature: { titleA: '拍下你的盤子。', titleB: { pre: '熱量', hl: '自己回來', post: '。' }, sub: '亞洲菜，算得準' },
  landing: { title: '認得椰漿飯的熱量日記。', highlight: '椰漿飯', subtitle: '拍一張、說一句或掃一下，剩下交給 RiceCal。' },
};
export default zhHant;
