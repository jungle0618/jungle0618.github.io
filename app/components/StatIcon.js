"use client";

const ITEM_ICON_SIZE = 16;

export default function StatIcon({ src, alt }) {
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      style={{ width: ITEM_ICON_SIZE, height: ITEM_ICON_SIZE, verticalAlign: "text-bottom", marginRight: 4 }}
    />
  );
}
