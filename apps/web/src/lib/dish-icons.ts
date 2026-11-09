/**
 * The picture vocabulary the localised home page draws from.
 *
 * Nine dishes have their own render in `/public/dishes` and the generic food
 * icons fill the rest. At 24-26px an icon reads as a shape and a colour, so a
 * bowl of laksa standing in for a bowl of phở costs nothing — which is why
 * these are named for what they look like rather than what they are.
 *
 * When a dish gets its own render, drop it in `/public/dishes` and point the
 * entry at the new file.
 */

export const BOWL_NOODLE = "/dishes/laksa.png";
export const BOWL_SOUP = "/dishes/bak-kut-teh.png";
export const PLATE_FRIED = "/dishes/char-kuey-teow.png";
export const PLATE_FRIED_ALT = "/dishes/mee-goreng.png";
export const PLATE_RICE = "/dishes/nasi-lemak.png";
export const PLATE_CURRY_RICE = "/dishes/nasi-kandar.png";
export const GRILLED = "/dishes/ikan-bakar.png";
export const DRINK = "/dishes/teh-tarik.png";
export const DESSERT = "/dishes/cendol.png";

/** Generic enough to stand in for a raw ingredient as well as a dish. */
export const MEAT = "/icons/food/chicken-drumstick.png";
export const COCONUT = "/icons/food/coconut.png";
export const POT = "/icons/food/cooking-pot.png";
export const PLATE = "/icons/food/portion-plate.png";
export const STARCH = "/icons/food/potato.png";
