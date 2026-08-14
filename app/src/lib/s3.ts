// import {
//   S3Client,
//   PutObjectCommand,
//   GetObjectCommand,
//   HeadBucketCommand,
//   CreateBucketCommand,
// } from "@aws-sdk/client-s3";
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// const {
//   MINIO_ENDPOINT,
//   MINIO_PUBLIC_ENDPOINT,
//   MINIO_ACCESS_KEY,
//   MINIO_SECRET_KEY,
//   MINIO_BUCKET,
// } = process.env;

// const common = {
//   region: "us-east-1",
//   forcePathStyle: true,
//   credentials: {
//     accessKeyId: MINIO_ACCESS_KEY!,
//     secretAccessKey: MINIO_SECRET_KEY!,
//   },
// };

// console.log(
//   `${MINIO_ENDPOINT},${MINIO_PUBLIC_ENDPOINT},
//    ${MINIO_ACCESS_KEY},
//    ${MINIO_SECRET_KEY},${MINIO_BUCKET}`,
// );

// export const s3 = new S3Client({
//   ...common,
//   endpoint: `${MINIO_ENDPOINT}`,
// });

// export const s3Presign = new S3Client({
//   ...common,
//   endpoint: `${MINIO_PUBLIC_ENDPOINT}`,
// });

// export const BUCKET = MINIO_BUCKET;

// export const ensureBucket = async (): Promise<void> => {
//   try {
//     await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
//   } catch {
//     await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
//   }
// };

// export const putObject = async (
//   key: string,
//   body: Buffer,
//   contentType = "image/png",
// ) => {
//   s3.send(
//     new PutObjectCommand({
//       Bucket: BUCKET,
//       Key: key,
//       ContentType: contentType,
//       Body: body,
//     }),
//   );
// };

// export const getObjectBuffer = async (key: string) => {
//   const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
//   return Buffer.from(await obj.Body!.transformToByteArray());
// };

// export const presignGet = (key: string, ttl = 3600) =>
//   getSignedUrl(s3Presign, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
//     expiresIn: ttl,
//   });
