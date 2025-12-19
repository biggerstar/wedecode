import crypto from "node:crypto";

/**
 * 解密 wxapkg 文件
 *
 * @param wxid 小程序 appid (如 wx1234567890abcdef)
 * @param encryptedData 加密的 wxapkg 文件数据
 * @returns 解密后的数据
 */
export function decryptWxapkg(wxid: string, encryptedData: Buffer): Buffer {
  const salt = "saltiest";
  const iv = Buffer.from("the iv: 16 bytes");

  // 使用 PBKDF2 派生密钥
  const dk = crypto.pbkdf2Sync(wxid, salt, 1000, 32, "sha1");

  // 创建 AES-CBC 解密器
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    new Uint8Array(dk),
    new Uint8Array(iv),
  );
  decipher.setAutoPadding(false);

  // 解密前 1024 字节 (跳过前 6 字节)
  const encryptedPart = encryptedData.subarray(6, 6 + 1024);
  const updateResult = decipher.update(new Uint8Array(encryptedPart));
  const finalResult = decipher.final();
  const decryptedPart = Buffer.concat([
    new Uint8Array(updateResult),
    new Uint8Array(finalResult),
  ]);

  // XOR 解密剩余数据
  const xorKey = wxid.length >= 2 ? wxid.charCodeAt(wxid.length - 2) : 0x66;
  const remainingData = encryptedData.subarray(6 + 1024);
  const xorDecrypted = Buffer.alloc(remainingData.length);
  for (let i = 0; i < remainingData.length; i++) {
    xorDecrypted[i] = remainingData[i] ^ xorKey;
  }

  // 合并解密数据 (取前 1023 字节 + XOR 解密部分)
  return Buffer.concat([
    new Uint8Array(decryptedPart.subarray(0, 1023)),
    new Uint8Array(xorDecrypted),
  ]);
}

/**
 * 检测文件是否需要解密
 * 加密的文件前6字节不是有效的 wxapkg 头
 */
export function needsDecryption(data: Buffer): boolean {
  if (data.length < 14) return false;

  const firstMark = data.readUInt8(0);
  const lastMark = data.readUInt8(13);

  // 如果不是有效的 wxapkg 标记，说明需要解密
  return firstMark !== 0xbe || lastMark !== 0xed;
}
