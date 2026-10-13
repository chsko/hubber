import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { FlatList, Image, Modal, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChatImageSource } from "@/lib/chat-image";

type Props = {
  photos: { messageId: string; count: number; start: number } | null;
  onClose: () => void;
};

/** Full-screen photo viewer; swipe between the photos of one message. */
export function ImageViewer({ photos, onClose }: Props) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const source = useChatImageSource();
  // A native SafeAreaView inside a Modal measures 0 on iOS; use the root insets.
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={photos !== null}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        {photos ? (
          <FlatList
            horizontal
            pagingEnabled
            data={Array.from({ length: photos.count }, (_, i) => i)}
            keyExtractor={(i) => String(i)}
            initialScrollIndex={photos.start}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item }) => (
              <Image
                source={source(photos.messageId, item)}
                style={{ width, height }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            )}
          />
        ) : null}
        <View
          className="absolute right-0 top-0"
          style={{ paddingTop: insets.top, paddingRight: insets.right }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            onPress={onClose}
            className="m-3 h-11 w-11 items-center justify-center rounded-full bg-black/60"
          >
            <X color="#FFFFFF" size={24} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
