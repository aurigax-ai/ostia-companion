import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { fitImage, PromptImage } from '../model/attachment';

export interface PickedImage {
  uri: string;
  image: PromptImage;
}

export type Pick = { picked: PickedImage } | { problem: string } | null;

const CAMERA_DENIED = 'Allow the camera for Ostia in Settings to take a photo.';
const TOO_LARGE = "Couldn't make that image small enough to send.";

async function encode(asset: ImagePicker.ImagePickerAsset): Promise<Pick> {
  const png = asset.mimeType === 'image/png';
  const image = await fitImage(async (side, quality) => {
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > side) context.resize(asset.width >= asset.height ? { width: side } : { height: side });
    const saved = await (await context.renderAsync()).saveAsync({ format: png ? SaveFormat.PNG : SaveFormat.JPEG, compress: quality, base64: true });
    return { data: saved.base64 ?? '', mime: png ? 'image/png' : 'image/jpeg' };
  });
  return image ? { picked: { uri: asset.uri, image } } : { problem: TOO_LARGE };
}

export async function pickImage(source: 'gallery' | 'camera'): Promise<Pick> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { problem: CAMERA_DENIED };
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? encode(asset) : null;
}
