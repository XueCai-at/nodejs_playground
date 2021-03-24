import crypto from "crypto";

function makeBigObj() {
  var obj = { a: 1 };
  var niter = 23;
  for (var i = 0; i < niter; i++) {
    obj = { obj1: obj, obj2: obj }; // Doubles in size each iter
  }
  return obj;
}

// before:
// function encryptV2(key: string, value: string): string {
// return _getV2Cryptopacker().encrypt(value, key);

// after:
// function encryptV2(key: string, value: string | Buffer): string {
// return _getV2Cryptopacker()
//         .bufferEncrypt(
//             typeof value === 'string' ? Buffer.from(value, 'utf-8') : value,
//             Cryptopacker.getAssociatedDataBuffer(key),
//         )
//         .toString('base64');

// TODO(xue): test Buffer.from(value, 'utf-8'), but encrypt() calls Buffer.from('utf-8')
// TODO(xue): test buffer.toString('base64'), but encrypt() calls buffer.toString('base64')
// TODO(xue): test encrypt() vs bufferEncrypt()

function elapsedMsSince(hrtime) {
  const now = process.hrtime.bigint();
  return elapsedMsBetween(hrtime, now);
}
function elapsedMsBetween(start, end) {
  return Math.round(Number(end - start) / 1e6);
}

export function jsonStringify(obj) {
  const start = process.hrtime.bigint();
  const ret = JSON.stringify(obj);
  const duration = elapsedMsSince(start);
  console.log(`JSON.stringify() took ${duration} ms`);
  return ret;
}

export function toBuffer(stringValue) {
  const start = process.hrtime.bigint();
  const ret = Buffer.from(stringValue, "utf-8");
  const duration = elapsedMsSince(start);
  console.log(`Buffer.from("utf-8") took ${duration} ms`);
  return ret;
}

const _EMPTY_BUFFER = Buffer.alloc(0);
const _IV_NUM_BYTES = 16;
const _MAC_NUM_BYTES = 32;
const keyBuffer = Buffer.from(
  "xCa42gBlmuH0PatOS2T7ndzIs7bNuN1hevDAuZkvcVgWp14WnVWSmfei2VvVvfBs11HNNR6JRqtR5FPFgDuXyz==",
  "base64"
);
const _ENCRYPTION_KEY_NUM_BYTES = 32;
const myCipherKey = keyBuffer.slice(0, _ENCRYPTION_KEY_NUM_BYTES);
const myHmacKey = keyBuffer.slice(_ENCRYPTION_KEY_NUM_BYTES);

export function bufferEncrypt(plainTextBuffer) {
  const start = process.hrtime.bigint();
  const associatedData = _EMPTY_BUFFER;
  const iv = crypto.randomBytes(_IV_NUM_BYTES);

  const cipher = crypto.createCipheriv("aes-256-cbc", myCipherKey, iv);
  const cipherText1 = cipher.update(plainTextBuffer);
  const cipherText2 = cipher.final();

  // Order of inputs to MAC from: https://tools.ietf.org/html/draft-mcgrew-aead-aes-cbc-hmac-sha2-05#section-2.1
  const hasher = crypto.createHmac("sha512", myHmacKey);
  hasher.update(associatedData);
  hasher.update(iv);
  hasher.update(cipherText1);
  hasher.update(cipherText2);
  const mac512 = hasher.digest();
  const mac = mac512.slice(0, _MAC_NUM_BYTES);

  const ret = Buffer.concat([iv, cipherText1, cipherText2, mac]);

  const duration = elapsedMsSince(start);
  console.log(`bufferEncrypt() took ${duration} ms`);
  return ret;
}

export function toBase64String(bufferValue) {
  const start = process.hrtime.bigint();
  const ret = bufferValue.toString("base64");
  const duration = elapsedMsSince(start);
  console.log(`buffer.toString("base64") took ${duration} ms`);
  return ret;
}

export function encryptToBase64String(stringValue) {
  return toBase64String(bufferEncrypt(toBuffer(stringValue)));
}

function testEncryption(obj) {
  const objStr = jsonStringify(obj);
  console.log(
    `obj string length: ${Math.round(objStr.length / 1024 / 1024)}MB\n`
  );

  const objBuffer = toBuffer(objStr);
  console.log(
    `obj buffer length: ${Math.round(objBuffer.length / 1024 / 1024)}MB\n`
  );

  const encryptedObjBuffer = bufferEncrypt(objBuffer);
  console.log(
    `encrypted obj buffer length: ${Math.round(
      encryptedObjBuffer.length / 1024 / 1024
    )}MB\n`
  );

  const encryptedObjBase64Str = toBase64String(encryptedObjBuffer);
  console.log(
    `encrypted obj base64 string length: ${Math.round(
      encryptedObjBase64Str.length / 1024 / 1024
    )}MB\n`
  );
  return encryptedObjBase64Str;
}

// -------------------------------------------------

// before:
// function decryptV2(key: string, envelope: string): string {
// const plainText = _getV2Cryptopacker().decrypt(envelope, key);

// after:
// function decryptV2(key: string, envelope: string): Buffer {
// const plainText = _getV2Cryptopacker().bufferDecrypt(
//     Buffer.from(envelope, 'base64'),
//     Cryptopacker.getAssociatedDataBuffer(key),
// );

// TODO(xue): test Buffer.from(envelope, 'base64'), but decypt() calls base64Strict.decode(envelope) which calls Buffer.from(encoded, 'base64')
// TODO(xue): test decypt() vs bufferDecrypt()

export function base64StringToBuffer(base64StringValue) {
  const start = process.hrtime.bigint();
  const ret = Buffer.from(base64StringValue, "base64");
  const duration = elapsedMsSince(start);
  console.log(`Buffer.from("base64") took ${duration} ms`);
  return ret;
}

export function bufferDecrypt(envelopeBuffer) {
  const start = process.hrtime.bigint();

  const cipherTextStart = _IV_NUM_BYTES;
  const macStart = envelopeBuffer.length - _MAC_NUM_BYTES;

  const iv = envelopeBuffer.slice(0, cipherTextStart);
  const cipherText = envelopeBuffer.slice(cipherTextStart, macStart);
  const mac = envelopeBuffer.slice(macStart);

  const associatedData = _EMPTY_BUFFER;

  // Must check the MAC before even *attempting* decryption to avoid padding oracle attacks.
  const hasher = crypto.createHmac("sha512", myHmacKey);
  hasher.update(associatedData);
  hasher.update(iv);
  hasher.update(cipherText);
  const expectedMac512 = hasher.digest();
  const expectedMac = expectedMac512.slice(0, _MAC_NUM_BYTES);
  console.log(`check mac: ${crypto.timingSafeEqual(mac, expectedMac)}`);

  const decipher = crypto.createDecipheriv("aes-256-cbc", myCipherKey, iv);
  const plainText1 = decipher.update(cipherText);
  const plainText2 = decipher.final();

  const ret = Buffer.concat([plainText1, plainText2]);

  const duration = elapsedMsSince(start);
  console.log(`bufferDecrypt() took ${duration} ms`);
  return ret;
}

export function decryptFromBase64String(base64StringValue) {
  return bufferDecrypt(base64StringToBuffer(base64StringValue));
}

function testDecryption(encryptedObjBase64Str) {
  const encryptedObjBuffer2 = base64StringToBuffer(encryptedObjBase64Str);
  console.log(
    `encrypted obj buffer length: ${Math.round(
      encryptedObjBuffer2.length / 1024 / 1024
    )}MB\n`
  );

  const objBuffer2 = bufferDecrypt(encryptedObjBuffer2);
  console.log(
    `decrypted obj buffer length: ${Math.round(
      objBuffer2.length / 1024 / 1024
    )}MB\n`
  );
}

// -------------------------------------------------

// before:
// async hgetAsync(
//     key: string,
//     field: string,
//     opts?: RedisCommandOptions,
// ): Promise<string | null> {
//     const rawString = await this._clearTextRedisClient.hgetAsync(key, field, opts);
//     return decrypt(key, rawString);

// after:
// async hgetAsync<ResultT extends string | Buffer>(
//     key: ResultT,
//     field: string,
//     opts?: RedisCommandOptions,
// ): Promise<ResultT | null> {
//     const cipherTextOrNull = await this._clearTextRedisClient.hgetAsync(key, field, opts);
//     if (cipherTextOrNull === null) {
//         return null;
//     }
//     const bufferOrNull = decrypt(
//         typeof key === 'string' ? key : key.toString('utf8'),
//         typeof cipherTextOrNull === 'string'
//             ? cipherTextOrNull
//             : cipherTextOrNull.toString('utf8'),
//     );
//     if (bufferOrNull === null) {
//         return null;
//     }
//     if (typeof key === 'string') {
//         return bufferOrNull.toString('utf8') as ResultT;
//     }
//     return bufferOrNull as ResultT;

// TODO(xue): test this._clearTextRedisClient.hgetAsync() with buffer key, but string value?

function test() {
  const obj = makeBigObj();
  const encrypted = testEncryption(obj);
  testDecryption(encrypted);
}
// test();
