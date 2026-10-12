import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { useMutation } from "convex/react";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** Profile photos and hub icons are square and small: resized on the phone before upload. */
const IMAGE_SIZE = 512;

/**
 * Lets the user pick and crop a square image, then resizes it to a small
 * JPEG. Resolves to the local file URI, or null if they cancel.
 */
export async function pickSquareImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return null;
  const resized = await ImageManipulator.manipulate(asset.uri)
    .resize({ width: IMAGE_SIZE, height: IMAGE_SIZE })
    .renderAsync();
  const { uri } = await resized.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return uri;
}

/** Event covers are wide (16:9) and sized for a phone screen. */
const COVER_WIDTH = 1200;

/** Lets the user pick and crop a 16:9 cover photo. Resolves to the local file URI, or null. */
export async function pickCoverImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 1,
    exif: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return null;
  let context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > COVER_WIDTH) context = context.resize({ width: COVER_WIDTH });
  const image = await context.renderAsync();
  const { uri } = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  return uri;
}

/** Chat photos keep enough detail for a phone screen; the long edge is capped here. */
const CHAT_IMAGE_EDGE = 1600;

/**
 * Re-encodes a photo for chat: long edge at most 1600px, JPEG. Re-encoding
 * also drops EXIF metadata, including GPS location (HUB-20).
 */
async function prepareChatImage(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const landscape = asset.width >= asset.height;
  const tooBig = Math.max(asset.width, asset.height) > CHAT_IMAGE_EDGE;
  let context = ImageManipulator.manipulate(asset.uri);
  if (tooBig) {
    context = context.resize(landscape ? { width: CHAT_IMAGE_EDGE } : { height: CHAT_IMAGE_EDGE });
  }
  const image = await context.renderAsync();
  const { uri } = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return uri;
}

/** Picks up to `max` photos from the library, ready for upload. Empty if cancelled. */
export async function pickChatImages(max: number): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: max,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, max).map(prepareChatImage));
}

/** Takes a photo with the camera, ready for upload. Null if cancelled or not allowed. */
export async function takeChatPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
    exif: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset === undefined ? null : prepareChatImage(asset);
}

/** Uploads a local JPEG to Convex storage and returns its storage id. */
export function useUploadImage() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  return async (uri: string): Promise<Id<"_storage">> => {
    const image = await (await fetch(uri)).blob();
    const response = await fetch(await generateUploadUrl(), {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: image,
    });
    if (!response.ok) throw new Error(`Image upload failed: ${response.status}`);
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    return storageId;
  };
}
