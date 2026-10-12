import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { useMutation } from "convex/react";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";

/** Profile photos are square and small: resized on the phone before upload. */
const PHOTO_SIZE = 512;

/**
 * Pick, crop, resize and upload a profile photo (HUB-12). `pick()` resolves
 * once the new photo is saved, or immediately if the user cancels.
 */
export function useProfilePhoto() {
  const generateUploadUrl = useMutation(api.users.generatePhotoUploadUrl);
  const setPhoto = useMutation(api.users.setPhoto);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return;

    setBusy(true);
    try {
      const resized = await ImageManipulator.manipulate(asset.uri)
        .resize({ width: PHOTO_SIZE, height: PHOTO_SIZE })
        .renderAsync();
      const { uri } = await resized.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
      const image = await (await fetch(uri)).blob();

      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: image,
      });
      if (!response.ok) throw new Error(`Photo upload failed: ${response.status}`);
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await setPhoto({ storageId });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await setPhoto({ storageId: null });
    } finally {
      setBusy(false);
    }
  }

  return { pick, remove, busy };
}
