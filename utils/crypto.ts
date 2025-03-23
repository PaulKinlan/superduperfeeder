// Crypto utility functions using Web Crypto API for Deno Deploy compatibility

const buff_to_base64 = (buff: Uint8Array): string =>
  btoa(String.fromCharCode.apply(null, [...buff]));

const base64_to_buf = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const enc = new TextEncoder();
const dec = new TextDecoder();

const getPasswordKey = async (password: string): Promise<CryptoKey> =>
  await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
    "deriveKey",
  ]);

const deriveKey = async (
  passwordKey: CryptoKey,
  salt: Uint8Array,
  keyUsage: KeyUsage[],
): Promise<CryptoKey> =>
  await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 250000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    keyUsage,
  );

/**
 * Encrypt data using AES-GCM with PBKDF2 key derivation
 * @param data The data to encrypt
 * @param password The password to use for encryption
 * @returns Base64 encoded encrypted data with salt and IV
 */
export async function encryptData(
  data: string,
  password: string,
): Promise<string> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt, ["encrypt"]);
    const encryptedContent = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      enc.encode(data),
    );

    const encryptedContentArr = new Uint8Array(encryptedContent);
    let buff = new Uint8Array(
      salt.byteLength + iv.byteLength + encryptedContentArr.byteLength,
    );
    buff.set(salt, 0);
    buff.set(iv, salt.byteLength);
    buff.set(encryptedContentArr, salt.byteLength + iv.byteLength);
    const base64Buff = buff_to_base64(buff);
    return base64Buff;
  } catch (e) {
    console.error(`Encryption error: ${e}`);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt data using AES-GCM with PBKDF2 key derivation
 * @param encryptedData Base64 encoded encrypted data with salt and IV
 * @param password The password to use for decryption
 * @returns Decrypted data as string
 */
export async function decryptData(
  encryptedData: string,
  password: string,
): Promise<string> {
  try {
    const encryptedDataBuff = base64_to_buf(encryptedData);
    const salt = encryptedDataBuff.slice(0, 16);
    const iv = encryptedDataBuff.slice(16, 16 + 12);
    const data = encryptedDataBuff.slice(16 + 12);
    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt, ["decrypt"]);
    const decryptedContent = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      data,
    );
    return dec.decode(decryptedContent);
  } catch (e) {
    console.error(`Decryption error: ${e}`);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Hash a password using Web Crypto API (replacement for bcrypt)
 * This function creates a hash that includes the salt and is compatible with the compare function
 * @param password The password to hash
 * @returns A promise that resolves to the hashed password
 */
export async function hash(password: string): Promise<string> {
  // We'll use a special prefix to identify our hash format
  const PREFIX = "WEBCRYPTO$";

  // Create a random string to use as the "data" we encrypt
  // This serves as an additional security measure
  const randomId = crypto.randomUUID();

  // Encrypt the random ID with the password
  const encrypted = await encryptData(randomId, password);

  // Return the prefixed hash
  return `${PREFIX}${encrypted}`;
}

/**
 * Compare a password with a hash (replacement for bcrypt's compare)
 * @param password The password to check
 * @param hash The hash to compare against
 * @returns A promise that resolves to true if the password matches, false otherwise
 */
export async function compare(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  const PREFIX = "WEBCRYPTO$";

  // Check if this is our hash format
  if (!hashedPassword.startsWith(PREFIX)) {
    // This is not our hash format (might be an old bcrypt hash)
    // For security, always return false in this case
    console.warn("Attempted to verify password with incompatible hash format");
    return false;
  }

  try {
    // Extract the encrypted part
    const encrypted = hashedPassword.substring(PREFIX.length);

    // Try to decrypt it with the provided password
    // If decryption succeeds, the password is correct
    await decryptData(encrypted, password);
    return true;
  } catch (e) {
    // If decryption fails, the password is incorrect
    return false;
  }
}
