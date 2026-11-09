import type { LocaleModule } from './types';

/** Spanish. Translated from ./en; every figure is carried across unchanged. */
const es: LocaleModule = {
  meta: { code: "es", flag: "🇪🇸", label: "Español" },

  phone: {
    today: {
      h: "Cada comida,\ncontada",
      hl: "contada",
      sub: "Un anillo para lo que queda. Macros y agua justo al lado.",
    },
    workout: {
      h: "Registra cada serie,\nsupera tu marca",
      hl: "supera tu marca",
      sub: "Tu última sesión junto a cada serie. Un trofeo cuando la superas.",
    },
    dish: {
      h: "Elige la ración\ny salen los números",
      hl: "y salen los números",
      sub: "Cuencos, platos o piezas. Cambia la ración y todo se ajusta.",
    },
    trends: {
      h: "Mira adónde\nse fue la semana",
      hl: "se fue la semana",
      sub: "Siete días, treinta días o un año. Calorías, agua y peso.",
    },
    feed: {
      h: 'Comparte tu plato,\nconecta con amigos',
      hl: 'conecta con amigos',
      sub: 'Sigue a tus amigos y comparte la comida que te gusta.',
    },
    recipes: {
      h: "Cocínalo una vez,\nregístralo en un toque",
      hl: "regístralo en un toque",
      sub: "Pon los ingredientes y para cuántos da. Después, un toque.",
    },
    panel: {
      title: "Cinco formas para\ncomida asiática",
      sub: "Puestos callejeros, cocina casera, paquetes de la tienda.",
      stats: { usersChoice: 'La elección de 2K usuarios' },
      metrics: { calories: "Calorías", water: "Agua", weight: "Peso" },
      snap    : { t: "Fotografía el plato", b: "Cada plato queda nombrado, medido y contado." },
      describe: { t: "Di qué comiste", b: "\"Nasi lemak con pollo frito y un teh tarik.\"" },
      scan    : { t: "Escanea el envase", b: "Se lee directo de la etiqueta, en un segundo." },
      search  : { t: "Busca en la base de datos", b: "Puestos callejeros, cadenas y cocina casera." },
      recipes : { t: "Guarda lo que cocinas", b: "Ponlo una vez y luego regístralo en un toque." },
    },
  },

  feature: {
    titleA: "Fotografía tu plato.",
    titleB: { pre: "Recibe las ", hl: "calorías", post: "." },
    sub: "Comida asiática, bien contada",
  },

  landing: {
    title: "Un diario de calorías que conoce el nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Fotografía, dilo o escanéalo. RiceCal cuenta el resto.",
  },
};

export default es;
