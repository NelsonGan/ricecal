import type { LocaleModule } from './types';

/** Polish. Translated from ./en; every figure is carried across unchanged. */
const pl: LocaleModule = {
  meta: { code: "pl", flag: "🇵🇱", label: "Polski" },

  phone: {
    today: {
      h: "Każdy posiłek,\npoliczony",
      hl: "policzony",
      sub: "Jeden pierścień pokazuje, ile zostało. Obok makro i woda.",
    },
    workout: {
      h: "Zapisuj każdą serię,\nbij swój rekord",
      hl: "bij swój rekord",
      sub: "Poprzedni trening obok każdej serii. Puchar, gdy go pobijesz.",
    },
    dish: {
      h: "Wybierz porcję,\nliczby pójdą za nią",
      hl: "liczby pójdą za nią",
      sub: "Miski, talerze albo sztuki. Zmień porcję, liczby się dopasują.",
    },
    trends: {
      h: "Zobacz, gdzie\npodział się tydzień",
      hl: "podział się tydzień",
      sub: "Siedem dni, trzydzieści dni albo rok. Kalorie, woda i waga.",
    },
    feed: {
      h: 'Podziel się posiłkiem,\npoznaj nowych znajomych',
      hl: 'poznaj nowych znajomych',
      sub: 'Obserwuj znajomych i dziel się ulubionym jedzeniem.',
    },
    recipes: {
      h: "Ugotuj raz,\npotem jeden dotyk",
      hl: "potem jeden dotyk",
      sub: "Wpisz składniki i liczbę porcji. Potem wystarczy jedno dotknięcie.",
    },
    panel: {
      title: "Pięć sposobów na\nkuchnię azjatycką",
      sub: "Kuchnia uliczna, domowe gotowanie, paczki ze sklepu.",
      stats: { usersChoice: 'Wybór 2K użytkowników' },
      metrics: { calories: "Kalorie", water: "Woda", weight: "Waga" },
      snap    : { t: "Zrób zdjęcie talerza", b: "Każde danie zostaje nazwane, zmierzone i policzone." },
      describe: { t: "Powiedz, co zjadłeś", b: "„Nasi lemak ze smażonym kurczakiem i teh tarik.\"" },
      scan    : { t: "Zeskanuj opakowanie", b: "Odczytane prosto z etykiety, w sekundę." },
      search  : { t: "Szukaj w bazie dań", b: "Kuchnia uliczna, sieciówki i domowe gotowanie." },
      recipes : { t: "Zapisz swoje przepisy", b: "Wpisz raz, potem jedno dotknięcie." },
    },
  },

  feature: {
    titleA: "Zrób zdjęcie talerza.",
    titleB: { pre: "Odbierz ", hl: "kalorie", post: "." },
    sub: "Kuchnia azjatycka, policzona porządnie",
  },

  landing: {
    title: "Dziennik kalorii, który zna nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Zdjęcie, słowa albo kod. Resztę policzy RiceCal.",
  },
};

export default pl;
