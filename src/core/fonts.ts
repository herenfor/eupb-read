/**
 * IDPF 字体混淆还原。
 * 算法：以 OPF unique-identifier 的 UTF-8 字节做 SHA-1，得到 20 字节密钥，
 * 与字体文件前 1040 字节逐字节 XOR（密钥循环）。
 * 规范参考：EPUB 3 OCF（font obfuscation），EPUB 2 书籍实践中同算法。
 */
const OBFUSCATED_BYTES = 1040;

export async function sha1Bytes(input: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-1", input as unknown as ArrayBuffer);
  return new Uint8Array(digest);
}

export async function deobfuscateFont(
  data: Uint8Array,
  uniqueIdentifier: string
): Promise<Uint8Array> {
  const key = await sha1Bytes(new TextEncoder().encode(uniqueIdentifier));
  const out = new Uint8Array(data);
  const n = Math.min(OBFUSCATED_BYTES, out.length);
  for (let i = 0; i < n; i++) {
    out[i] ^= key[i % key.length];
  }
  return out;
}

/** 仅对前 1040 字节混淆（用于测试构造混淆字体）。 */
export async function obfuscateFont(
  data: Uint8Array,
  uniqueIdentifier: string
): Promise<Uint8Array> {
  return deobfuscateFont(data, uniqueIdentifier);
}
