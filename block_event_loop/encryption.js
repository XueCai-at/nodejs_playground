var obj = { a: 1 };
var niter = 23;
for (var i = 0; i < niter; i++) {
  obj = { obj1: obj, obj2: obj }; // Doubles in size each iter
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

export function toBase64String(bufferValue) {
  const start = process.hrtime.bigint();
  const ret = bufferValue.toString("base64");
  const duration = elapsedMsSince(start);
  console.log(`buffer.toString("base64") took ${duration} ms`);
  return ret;
}

const objStr = jsonStringify(obj);
console.log(
  `obj string length: ${Math.round(objStr.length / 1024 / 1024)}MB\n`
);

const objBuffer = toBuffer(objStr);
console.log(
  `obj buffer length: ${Math.round(objBuffer.length / 1024 / 1024)}MB\n`
);

const objBase64Str = toBase64String(objBuffer);
console.log(
  `obj base64 string length: ${Math.round(
    objBase64Str.length / 1024 / 1024
  )}MB\n`
);

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

const objBuffer2 = base64StringToBuffer(objBase64Str);
console.log(
  `obj buffer length: ${Math.round(objBuffer2.length / 1024 / 1024)}MB\n`
);

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
