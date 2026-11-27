import AsyncStorage from '@react-native-async-storage/async-storage';
import { photoStorage } from './photo-storage';
import { intakeImageBytes } from './intake-media-bytes';
import { getAuth } from './auth';
import { getActiveHouseholdRevision, resolveActiveHousehold } from './active-household-service';
export interface UploadedKitchenImage { id: string; url: string; urlExpiresAt: string }
export async function uploadKitchenImage(ref: string, kind: 'FOOD' | 'RECEIPT'): Promise<UploadedKitchenImage> {
  const auth = getAuth();
  const identity = auth.getIdentityRevision();
  const household = await resolveActiveHousehold(auth, AsyncStorage);
  const revision = getActiveHouseholdRevision(auth);
  const assertContext = async () => {
    const current = await resolveActiveHousehold(auth, AsyncStorage);
    if (identity !== auth.getIdentityRevision() || household.id !== current.id || revision !== getActiveHouseholdRevision(auth)) throw new Error('Your kitchen changed. Reopen this screen.');
  };
  const uri = await photoStorage.resolve(ref);
  if (!uri) throw new Error('Choose the image again.');
  try {
    const image = await intakeImageBytes(uri);
    if (image.sizeBytes <= 0 || image.sizeBytes > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
    await assertContext();
    const { requestImageUpload: ticket } = await auth.authenticatedGraphql<{ requestImageUpload: { storageKey: string; uploadUrl: string; contentType: string } }>(
      'mutation KitchenImageTicket($input: RequestImageUploadInput!) { requestImageUpload(input: $input) { storageKey uploadUrl contentType } }',
      { input: { mimeType: image.mimeType, sizeBytes: image.sizeBytes } }, household.id);
    await assertContext();
    const response = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': ticket.contentType }, body: image.body });
    if (!response.ok) throw new Error('Image upload failed. Try again.');
    await assertContext();
    const { confirmImageUpload: saved } = await auth.authenticatedGraphql<{ confirmImageUpload: UploadedKitchenImage }>(
      'mutation ConfirmKitchenImage($input: ConfirmImageUploadInput!) { confirmImageUpload(input: $input) { id url urlExpiresAt } }',
      { input: { storageKey: ticket.storageKey, type: kind } }, household.id);
    await assertContext();
    return saved;
  } finally { photoStorage.release(uri); }
}
