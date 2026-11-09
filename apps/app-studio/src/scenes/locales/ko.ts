import type { LocaleModule } from './types';

/** Korean. Translated from ./en; every figure is carried across unchanged. */
const ko: LocaleModule = {
  meta: { code: "ko", flag: "🇰🇷", label: "한국어" },

  phone: {
    today: {
      h: "한 끼도\n빠짐없이",
      hl: "빠짐없이",
      sub: "남은 양은 링 하나로. 바로 옆에 탄단지와 물까지.",
    },
    workout: {
      h: "모든 세트를 기록하고\n내 기록을 깨세요",
      hl: "내 기록을 깨세요",
      sub: "세트마다 지난 기록이 옆에 보여요. 넘으면 트로피를 받아요.",
    },
    dish: {
      h: "양만 정하면\n숫자는 따라와요",
      hl: "숫자는 따라와요",
      sub: "그릇, 접시, 조각 단위로. 양을 바꾸면 숫자도 바뀝니다.",
    },
    trends: {
      h: "이번 주가\n어디로 갔는지",
      hl: "어디로 갔는지",
      sub: "7일, 30일, 1년. 칼로리와 물, 그리고 체중.",
    },
    feed: {
      h: '내 식사를 공유하고\n친구와 연결돼요',
      hl: '친구와 연결돼요',
      sub: '친구를 팔로우하고 좋아하는 음식을 공유하세요.',
    },
    recipes: {
      h: "한 번 만들면\n다음엔 한 번만 탭",
      hl: "다음엔 한 번만 탭",
      sub: "재료와 몇 인분인지 한 번만 입력하면 됩니다.",
    },
    panel: {
      title: "아시아 음식을\n남기는 다섯 가지",
      sub: "노점 음식, 집밥, 가게에서 산 포장 식품까지.",
      stats: { usersChoice: '2K 사용자의 선택' },
      metrics: { calories: "칼로리", water: "물", weight: "체중" },
      snap    : { t: "접시를 찍기", b: "접시 위 음식마다 이름과 양, 칼로리까지." },
      describe: { t: "먹은 걸 말하기", b: "“달걀을 올린 비빔밥 한 그릇.”" },
      scan    : { t: "바코드 찍기", b: "라벨에서 바로 읽어옵니다." },
      search  : { t: "음식 데이터베이스 검색", b: "노점 음식, 프랜차이즈, 집밥까지." },
      recipes : { t: "내 레시피 저장", b: "한 번만 입력하면 다음엔 한 번 탭." },
    },
  },

  feature: {
    titleA: "접시를 찍으세요.",
    titleB: { pre: "", hl: "칼로리", post: "가 돌아옵니다." },
    sub: "아시아 음식, 제대로 계산",
  },

  landing: {
    title: "비빔밥을 아는 칼로리 일기.",
    highlight: "비빔밥",
    subtitle: "찍거나, 말하거나, 스캔하세요. 나머지는 RiceCal이 합니다.",
  },
};

export default ko;
