export async function intakeImageBytes(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('This image could not be read.');
  const blob = await response.blob();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(blob.type)) throw new Error('Choose a JPEG, PNG, WebP or HEIC photo.');
  return { body: await blob.arrayBuffer(), mimeType: blob.type, sizeBytes: blob.size };
}
