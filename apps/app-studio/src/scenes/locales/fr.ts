import type { LocaleModule } from './types';

/** French. Translated from ./en; every figure is carried across unchanged. */
const fr: LocaleModule = {
  meta: { code: "fr", flag: "🇫🇷", label: "Français" },

  phone: {
    today: {
      h: "Chaque repas,\ncompté",
      hl: "compté",
      sub: "Un anneau pour ce qu’il reste. Macros et eau juste à côté.",
    },
    workout: {
      h: "Notez chaque série,\nbattez votre record",
      hl: "battez votre record",
      sub: "Votre dernière séance à côté de chaque série. Un trophée quand vous la battez.",
    },
    dish: {
      h: "Choisissez la portion,\nles chiffres suivent",
      hl: "les chiffres suivent",
      sub: "Bols, assiettes ou pièces. Changez la portion, tout s’ajuste.",
    },
    trends: {
      h: "Voyez où\nest passée la semaine",
      hl: "est passée la semaine",
      sub: "Sept jours, trente jours ou un an. Calories, eau et poids.",
    },
    feed: {
      h: 'Partagez votre repas,\nretrouvez vos amis',
      hl: 'retrouvez vos amis',
      sub: 'Suivez vos amis et partagez vos plats préférés.',
    },
    recipes: {
      h: "Cuisinez une fois,\nun geste ensuite",
      hl: "un geste ensuite",
      sub: "Entrez les ingrédients et le nombre de parts. Ensuite, un geste.",
    },
    panel: {
      title: "Cinq façons pour\nla cuisine asiatique",
      sub: "Cuisine de rue, plats maison, paquets du magasin.",
      stats: { usersChoice: 'Le choix de 2K utilisateurs' },
      metrics: { calories: "Calories", water: "Eau", weight: "Poids" },
      snap    : { t: "Photographiez l’assiette", b: "Chaque plat est nommé, mesuré et compté." },
      describe: { t: "Dites ce que vous avez mangé", b: "« Nasi lemak avec du poulet frit et un teh tarik. »" },
      scan    : { t: "Scannez l’emballage", b: "Lu directement sur l’étiquette, en une seconde." },
      search  : { t: "Cherchez dans la base", b: "Cuisine de rue, chaînes et plats maison." },
      recipes : { t: "Gardez vos recettes", b: "Saisissez une fois, puis enregistrez en un geste." },
    },
  },

  feature: {
    titleA: "Photographiez votre assiette.",
    titleB: { pre: "Recevez les ", hl: "calories", post: "." },
    sub: "La cuisine asiatique, bien comptée",
  },

  landing: {
    title: "Un journal de calories qui connaît le nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Photo, mots ou code-barres. RiceCal compte le reste.",
  },
};

export default fr;
