import type { LocaleModule } from './types';

/** Portuguese (Brazil first). Translated from ./en; every figure is carried across unchanged. */
const pt: LocaleModule = {
  meta: { code: "pt", flag: "🇧🇷", label: "Português" },

  phone: {
    today: {
      h: "Cada refeição,\ncontada",
      hl: "contada",
      sub: "Um anel para o que sobra. Macros e água logo ao lado.",
    },
    workout: {
      h: "Registre cada série,\nsupere sua marca",
      hl: "supere sua marca",
      sub: "Sua última sessão ao lado de cada série. Um troféu quando você a supera.",
    },
    dish: {
      h: "Escolha a porção,\nos números seguem",
      hl: "os números seguem",
      sub: "Tigelas, pratos ou pedaços. Mude a porção e tudo acompanha.",
    },
    trends: {
      h: "Veja para onde\nfoi a semana",
      hl: "foi a semana",
      sub: "Sete dias, trinta dias ou um ano. Calorias, água e peso.",
    },
    feed: {
      h: 'Compartilhe seu prato,\nconecte-se com amigos',
      hl: 'conecte-se com amigos',
      sub: 'Siga amigos e compartilhe suas comidas favoritas.',
    },
    recipes: {
      h: "Cozinhe uma vez,\nregistre num toque",
      hl: "registre num toque",
      sub: "Coloque os ingredientes e quantas porções rende. Depois, um toque.",
    },
    panel: {
      title: "Cinco jeitos para\ncomida asiática",
      sub: "Comida de rua, comida caseira, pacotes do mercado.",
      stats: { usersChoice: 'A escolha de 2K usuários' },
      metrics: { calories: "Calorias", water: "Água", weight: "Peso" },
      snap    : { t: "Fotografe o prato", b: "Cada prato nomeado, medido e contado." },
      describe: { t: "Diga o que você comeu", b: "\"Nasi lemak com frango frito e um teh tarik.\"" },
      scan    : { t: "Escaneie a embalagem", b: "Lido direto do rótulo, em um segundo." },
      search  : { t: "Busque no banco de dados", b: "Comida de rua, redes e comida caseira." },
      recipes : { t: "Guarde o que você cozinha", b: "Preencha uma vez e depois registre num toque." },
    },
  },

  feature: {
    titleA: "Fotografe seu prato.",
    titleB: { pre: "Receba as ", hl: "calorias", post: "." },
    sub: "Comida asiática, contada direito",
  },

  landing: {
    title: "Um diário de calorias que conhece nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Foto, palavras ou código. RiceCal conta o resto.",
  },
};

export default pt;
