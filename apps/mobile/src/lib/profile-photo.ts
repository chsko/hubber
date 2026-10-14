import { api } from "@hubbr/backend/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { pickSquareImage, useUploadImage } from "@/lib/image-upload";

/**
 * Pick, upload and set (or remove) the profile photo (HUB-12). `pick()`
 * resolves once the new photo is saved, or immediately if the user cancels.
 */
export function useProfilePhoto() {
  const upload = useUploadImage();
  const setPhoto = useMutation(api.users.setPhoto);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const uri = await pickSquareImage();
    if (uri === null) return;
    setBusy(true);
    try {
      await setPhoto({ storageId: await upload(uri) });
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
