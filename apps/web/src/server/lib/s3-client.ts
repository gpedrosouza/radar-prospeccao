/**
 * S3Client para apps/web — usado exclusivamente para gerar URLs pré-assinadas
 * de download sob demanda (não para upload, que é feito pelo worker).
 *
 * URLs geradas on-demand: evita expiração antes do usuário baixar o arquivo
 * (se gerassem no momento da conclusão do job, poderiam expirar antes do download).
 */

import { S3Client } from "@aws-sdk/client-s3";

export function getS3Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Variáveis R2 não configuradas: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    endpoint,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}
