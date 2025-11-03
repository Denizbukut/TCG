import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

export const runtime = 'nodejs'; // sharp braucht Node (nicht edge)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * .env.local – benötigte Variablen:
 * NEXT_PUBLIC_R2_ACCESS_KEY=xxxxxxxx  (erforderlich)
 * NEXT_PUBLIC_R2_SECRET_KEY=xxxxxxxx  (erforderlich)
 *
 * Optional (mit Fallbacks im Code):
 * R2_BUCKET_NAME=anime-images (Fallback: 'anime-images')
 * R2_ENDPOINT=https://<yourid>.r2.cloudflarestorage.com (kann im Code gesetzt werden)
 * R2_PUBLIC_BASE_URL=https://ani-labs.xyz (Fallback: 'https://ani-labs.xyz')
 *
 * Optional (für Diagnose-Ausgaben):
 * UPLOAD_DIAG=1
 */

// Bucket-Name: "anime-images" (mit Bindestrich, nicht Leerzeichen)
const BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'anime-images';
// R2_ENDPOINT - Fallback zum bekannten Endpoint
const R2_ENDPOINT = 'https://b8cdaa792cd918cde36b48b2d9a0785e.r2.cloudflarestorage.com';
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || 'https://ani-labs.xyz';

function missingEnv() {
  const miss: string[] = [];
  if (!process.env.R2_ENDPOINT) miss.push("R2_ENDPOINT");
  if (!process.env.R2_ACCESS_KEY) miss.push("R2_ACCESS_KEY");
  if (!process.env.R2_SECRET_KEY) miss.push("R2_SECRET_KEY");
  if (!process.env.R2_PUBLIC_BASE_URL) miss.push("R2_PUBLIC_BASE_URL");
  return miss;
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: "1833343c0104a77f1e024176201c3157",
    secretAccessKey: "9826a75fcf3785c7fae4f4ec642cb50401b0a80f70897b7792272137f10689d4",
  },
});

// Card dimensions: 3:4 aspect ratio, max 600x800 (CANVAS_WIDTH x CANVAS_HEIGHT from image-editor)
const CARD_WIDTH = 600;
const CARD_HEIGHT = 800;

const makeName = (tokenAddress: string, ext: string) =>
  `token-cards/${tokenAddress.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

export async function POST(req: NextRequest) {
  try {
    // Debug: Log incoming headers (only in development or when UPLOAD_DIAG is set)
    if (process.env.UPLOAD_DIAG === '1' || process.env.NODE_ENV === 'development') {
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key] = value;
      });
      console.log('[upload-card-image] Incoming request headers:', Object.keys(headers));
      // Only log authorization header name, not value for security
      if (req.headers.get('authorization')) {
        const authHeader = req.headers.get('authorization') || '';
        console.log('[upload-card-image] Authorization header present, length:', authHeader.length);
        // Check for invalid characters
        const invalidChars = /[^\x20-\x7E]/;
        if (invalidChars.test(authHeader)) {
          console.error('[upload-card-image] WARNING: Invalid characters detected in authorization header');
        }
      }
    }
    
    // ENV check
    const miss = missingEnv();
    if (miss.length) {
      const msg = `[upload-card-image] Missing ENV: ${miss.join(', ')}`;
      console.error(msg);
      console.error('Available ENV vars:', {
        hasNEXT_PUBLIC_R2_ACCESS_KEY: !!process.env.NEXT_PUBLIC_R2_ACCESS_KEY,
        hasNEXT_PUBLIC_R2_SECRET_KEY: !!process.env.NEXT_PUBLIC_R2_SECRET_KEY,
        hasR2_ENDPOINT: !!process.env.R2_ENDPOINT,
        R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'anime-images',
      });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const tokenAddress = formData.get('tokenAddress') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!tokenAddress) {
      return NextResponse.json({ error: 'No token address provided' }, { status: 400 });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type (${file.type}). Only JPEG, PNG, WebP, GIF allowed.` },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Max 10MB' }, { status: 400 });
    }

    // Optionaler Diagnosemodus (lädt roh hoch, ohne sharp)
    const DIAG = process.env.UPLOAD_DIAG === '1';

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    // Wenn DIAG aktiv → lade Original hoch (ohne Resize/Convert)
    if (DIAG) {
      const rawName = makeName(tokenAddress, file.type === 'image/gif' ? 'gif' :
                                      file.type.includes('png') ? 'png' :
                                      file.type.includes('webp') ? 'webp' : 'jpg');
      try {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: rawName,
            Body: buf,
            ContentType: file.type,
            CacheControl: 'public, max-age=31536000, immutable',
          })
        );
      } catch (e: any) {
        console.error('[upload-card-image DIAG] s3 put error:', e?.name, e?.message);
        return NextResponse.json(
          { error: `[upload-card-image DIAG] ${e?.name || 'S3Error'}: ${e?.message || e}` },
          { status: 500 }
        );
      }
      const base = R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
      return NextResponse.json({
        success: true,
        path: rawName,
        url: `${base}/${rawName}`,
        diag: true,
      });
    }

    // Normaler Weg: Optimierung für Card-Bilder (3:4 Verhältnis, max 600x800)
    let body: Buffer;
    let contentType: string;
    let filename: string;

    if (file.type === 'image/gif') {
      // GIF: Animation erhalten, aber auf Card-Größe beschränken
      body = buf;
      contentType = 'image/gif';
      filename = makeName(tokenAddress, 'gif');
    } else {
      // Alle anderen Formate: Konvertieren zu WebP und auf Card-Dimensionen anpassen
      body = await sharp(buf)
        .rotate() // Auto-rotate basierend auf EXIF
        .resize(CARD_WIDTH, CARD_HEIGHT, {
          fit: 'inside', // Behält Aspect Ratio bei, passt in 600x800
          withoutEnlargement: true, // Vergrößert nicht, nur verkleinert
        })
        .webp({ quality: 85 })
        .toBuffer();
      contentType = 'image/webp';
      filename = makeName(tokenAddress, 'webp');
    }

    try {
      console.log('[upload-card-image] Uploading to bucket:', BUCKET, 'filename:', filename);
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: filename,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
      console.log('[upload-card-image] Upload successful');
    } catch (e: any) {
      console.error('[upload-card-image] s3 put error:', {
        name: e?.name,
        message: e?.message,
        code: e?.code,
        bucket: BUCKET,
        endpoint: process.env.R2_ENDPOINT,
      });
      return NextResponse.json(
        { error: `[upload-card-image] ${e?.name || 'S3Error'}: ${e?.message || e}` },
        { status: 500 }
      );
    }

    const base = R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
    const imageUrl = `${base}/${filename}`;

    return NextResponse.json({
      success: true,
      path: filename,
      url: imageUrl,
    });
  } catch (err: any) {
    console.error('[upload-card-image] fatal:', err?.message || err);
    console.error('[upload-card-image] error details:', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      cause: err?.cause,
    });
    
    // Handle specific header validation errors from Vercel
    if (err?.message?.includes('Invalid character in header content') || 
        err?.message?.includes('authorization')) {
      console.error('[upload-card-image] Header validation error detected. This may be caused by invalid characters in request headers.');
      return NextResponse.json(
        { error: `[upload-card-image] Header validation error. Please ensure no special characters are in request headers. Original: ${String(err?.message || err)}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: `[upload-card-image] ${String(err?.message || err)}` },
      { status: 500 }
    );
  }
}

