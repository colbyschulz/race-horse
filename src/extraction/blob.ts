// src/extraction/blob.ts
export async function fetchPlanFileBytes(blobUrl: string): Promise<ArrayBuffer> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const res = await fetch(blobUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`fetchPlanFileBytes: ${res.status} ${res.statusText}`);
  }
  return res.arrayBuffer();
}
