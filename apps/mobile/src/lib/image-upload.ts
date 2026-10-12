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
