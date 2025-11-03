import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_R2_ACCESS_KEY!,
    secretAccessKey: process.env.NEXT_PUBLIC_R2_SECRET_KEY!,
  },
});

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing image key' }, { status: 400 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
    });

    const { Body, ContentType } = await s3.send(command);

    if (!Body) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const stream = Body as ReadableStream;

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': ContentType || 'image/jpeg',
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error('Error fetching image:', err);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}
