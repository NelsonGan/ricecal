import type { LocaleModule } from './types';

/** Japanese. Translated from ./en; every figure is carried across unchanged. */
const ja: LocaleModule = {
  meta: { code: "ja", flag: "🇯🇵", label: "日本語" },

  phone: {
    today: {
      h: "どの一食も\nちゃんと数える",
      hl: "ちゃんと数える",
      sub: "残りはリングひとつ。すぐ横に三大栄養素と水分も。",
    },
    workout: {
      h: "セットを記録して、\n自己ベストを更新",
      hl: "自己ベストを更新",
      sub: "各セットの横に前回の記録。超えたらトロフィー。",
    },
    dish: {
      h: "量を決めれば\n数字はついてくる",
      hl: "数字はついてくる",
      sub: "丼でも皿でも個数でも。量を変えれば数字も変わります。",
    },
    trends: {
      h: "今週がどこへ\n消えたかを見る",
      hl: "消えたかを見る",
      sub: "7日、30日、1年。カロリー、水分、体重。",
    },
    feed: {
      h: '食事をシェア、\n仲間とつながる',
      hl: '仲間とつながる',
      sub: '友達をフォローして、好きな料理をシェア。',
    },
    recipes: {
      h: "一度作れば\nあとは一回タップ",
      hl: "あとは一回タップ",
      sub: "材料と何人分かを一度だけ入力。あとはタップひとつ。",
    },
    panel: {
      title: "アジアの料理を\n記録する五通り",
      sub: "屋台の料理も、家の料理も、店の袋菓子も。",
      stats: { usersChoice: '2K人のユーザーが選ぶ' },
      metrics: { calories: "カロリー", water: "水分", weight: "体重" },
      snap    : { t: "皿を撮る", b: "皿の上の料理を一品ずつ、名前と量とカロリーに。" },
      describe: { t: "食べたものを言う", b: "「鮭おにぎりと味噌汁」" },
      scan    : { t: "パッケージを読む", b: "ラベルからそのまま、一瞬で。" },
      search  : { t: "食品データベースを引く", b: "屋台の料理も、チェーン店も、家の料理も。" },
      recipes : { t: "自分のレシピを保存", b: "一度入れれば、次からはタップひとつ。" },
    },
  },

  feature: {
    titleA: "皿を撮るだけ。",
    titleB: { pre: "", hl: "カロリー", post: "が返ってくる。" },
    sub: "アジアの料理を、正しく数える",
  },

  landing: {
    title: "鮭おにぎりを知っているカロリー日記。",
    highlight: "鮭おにぎり",
    subtitle: "撮る、言う、読み取る。あとは RiceCal。",
  },
};

export default ja;
