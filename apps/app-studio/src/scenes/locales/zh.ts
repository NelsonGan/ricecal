import type { LocaleModule } from './types';

/** Simplified Chinese. Translated from ./en; every figure is carried across unchanged. */
const zh: LocaleModule = {
  meta: { code: "zh", flag: "🇨🇳", label: "简体中文" },

  phone: {
    today: {
      h: "每一餐\n都算得清",
      hl: "都算得清",
      sub: "一个圆环看今天还剩多少，旁边就是三大营养素和喝水。",
    },
    workout: {
      h: "每组都记下，\n刷新个人纪录",
      hl: "刷新个人纪录",
      sub: "每组旁边都有上次的成绩，超越就有奖杯。",
    },
    dish: {
      h: "选好分量，\n数字自己来",
      hl: "数字自己来",
      sub: "碗、盘还是块都行。换个分量，数字跟着变。",
    },
    trends: {
      h: "这一周\n都吃到哪去了",
      hl: "都吃到哪去了",
      sub: "七天、三十天或一年。热量、喝水和体重。",
    },
    feed: {
      h: '分享餐点，\n认识同好',
      hl: '认识同好',
      sub: '关注朋友，分享你喜欢的美食。',
    },
    recipes: {
      h: "做一次，\n以后一点就好",
      hl: "以后一点就好",
      sub: "写清用了什么、够几个人吃。之后一点即可。",
    },
    panel: {
      title: "五种方式\n记亚洲菜",
      sub: "小贩摊、家常菜，还有店里的包装食品。",
      stats: { usersChoice: '2K 用户之选' },
      metrics: { calories: "热量", water: "喝水", weight: "体重" },
      snap    : { t: "拍一张盘子", b: "盘里每道菜都被认出、估量并算清。" },
      describe: { t: "说出你吃了什么", b: "\"椰浆饭配炸鸡，再一杯拉茶。\"" },
      scan    : { t: "扫包装条码", b: "直接读标签，一秒出结果。" },
      search  : { t: "搜食物数据库", b: "小贩摊、连锁店和家常菜都有。" },
      recipes : { t: "存下你的菜谱", b: "写一次，以后一点就记好。" },
    },
  },

  feature: {
    titleA: "拍下你的盘子。",
    titleB: { pre: "热量", hl: "自己回来", post: "。" },
    sub: "亚洲菜，算得准",
  },

  landing: {
    title: "认得椰浆饭的热量日记。",
    highlight: "椰浆饭",
    subtitle: "拍一张、说一句或扫一下，剩下交给 RiceCal。",
  },
};

export default zh;
