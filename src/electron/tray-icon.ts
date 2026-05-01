/**
 * Inline tray icon (16×16 PNG, base64). 単色 'L' ロゴのプレースホルダ.
 * 後で本番アイコンを `assets/tray.png` で差し替える際に置き換える.
 */

import { nativeImage, type NativeImage } from "electron";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAVUlEQVR42mNgGAWjYBSMglEwCkbBKBgFlAJGRkbG/4z/B9QAJgY6AyYGOgMmBjoDJgY6AyYGOgMmBjoDJgY6AyYGOgMmBjoDJgY6AyYGOgMmBjoDJgYAAGsAAYZ6m6xkAAAAAElFTkSuQmCC";

export function getTrayIcon(): NativeImage {
  return nativeImage.createFromBuffer(Buffer.from(PNG_BASE64, "base64"));
}
