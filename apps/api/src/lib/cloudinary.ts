import crypto from "crypto";

const CLOUD_NAME = process.env["CLOUDINARY_CLOUD_NAME"] ?? "";
const API_KEY = process.env["CLOUDINARY_API_KEY"] ?? "";
const API_SECRET = process.env["CLOUDINARY_API_SECRET"] ?? "";

export function generateSignedUploadParams(folder: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = { folder, timestamp };

  const sortedStr = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  const signature = crypto
    .createHash("sha1")
    .update(sortedStr + API_SECRET)
    .digest("hex");

  return { cloudName: CLOUD_NAME, apiKey: API_KEY, timestamp, folder, signature };
}

export function isValidCloudinaryPublicId(publicId: string, folder: string): boolean {
  return publicId.startsWith(`${folder}/`);
}
