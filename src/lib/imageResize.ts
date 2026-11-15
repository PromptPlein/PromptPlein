/**
 * Verkleint een gekozen beeld tot een JPEG als data-URL, met de lange kant op
 * hoogstens `max` pixels. Voor de stijl van een voorbeeld is dat ruim genoeg, en
 * zo blijft het verzoek klein, ook bij een foto van twaalf megapixel.
 *
 * Gooit een fout als de browser het bestand niet als beeld kan lezen.
 */
export async function fileToJpegDataUrl(file: File, max = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Geen tekenvlak');
    // Wit onder een doorzichtig beeld, anders wordt dat zwart in een JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}
