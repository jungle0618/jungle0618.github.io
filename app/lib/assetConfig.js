/** UI 圖示路徑；遊戲規則與數值請放在 gameConfig.js。 */
const ITEM_IMAGE_DIR = "/item_images";
const iconPath = (file) => `${ITEM_IMAGE_DIR}/${file}.png`;
const mapIcons = (rows) => Object.fromEntries(
  Object.entries(rows).map(([key, file]) => [key, iconPath(file)])
);

export const ITEM_ICONS = Object.freeze(mapIcons({
  heart: "heart",
  sword: "crossed_swords",
  battle: "crossed_swords",
}));

export const BATTLE_EFFECT_ICONS = Object.freeze(mapIcons({
  armor: "armor",
  pierce: "pierce",
  leech: "leech",
  damage: "damage",
  heal: "heal",
  atkBuff: "atkBuff",
  defDebuff: "defDebuff",
  star: "star",
}));
