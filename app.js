const express = require("express");
const wtf = require("wtfnode");

////////////////// setSendBufferSize /////////////////////
const os = require("os");
const ref = require("ref-napi");
const ffi = require("ffi-napi");
const cInt = ref.types.int;
const cVoid = ref.types.void;
const bindings = ffi.Library(null, {
  setsockopt: [cInt, [cInt, cInt, cInt, ref.refType(cVoid), cInt]],
});

let SOL_SOCKET;
let SO_SNDBUF;
switch (os.platform()) {
  case "linux":
    SOL_SOCKET = 1;
    SO_SNDBUF = 7;
    break;

  case "darwin":
    SOL_SOCKET = 0xffff;
    SO_SNDBUF = 0x1001;
    break;
}

function setsockoptInt(fd, level, name, value) {
  const valueRef = ref.alloc(cInt, value);
  bindings.setsockopt(fd, level, name, valueRef, cInt.size);
}
function setSendBufferSize(res) {
  const fd = res.socket._handle.fd;
  setsockoptInt(fd, SOL_SOCKET, SO_SNDBUF, 4 * 1024 * 1024);
}
//////////////////////////////////////////////////////////

////////////////// async.queue /////////////////////
const async = require("async");
const requestQueue = async.queue(async function (task, callback) {
  await requestHandler(task);
  callback();
}, 1);
//////////////////////////////////////////////////////////

////////////////// worker threads /////////////////////
const { Worker } = require("worker_threads");

const responseSendWorkerThread = new Worker("./response_send_thread.js");
// responseSendWorkerThread.on("message", () => {});
// responseSendWorkerThread.on("error", () => {});
responseSendWorkerThread.on("exit", (code) => {
  console.log(`responseSendWorkerThread exited. code: ${code}`);
});
//////////////////////////////////////////////////////////

function makeBigObject(leaves, depth) {
  if (depth === 0) {
    return "howdy";
  } else {
    const ret = {};
    for (let i = 0; i < leaves; ++i) {
      ret[i] = makeBigObject(leaves, depth - 1);
    }
    return ret;
  }
}

function getTimeMs() {
  return Date.now() - firstRequestStartTime;
}

const app = express();

const bigObject = makeBigObject(2000, 2);
let requestCount = 0;
let firstRequestStartTime;

async function requestHandler({ requestIndex, req, res }) {
  if (requestIndex === 1) {
    firstRequestStartTime = Date.now();
  }

  console.log(`[${getTimeMs()}] Processing request ${requestIndex}...`);
  // 115+8KB or 13+4MB
  for (let i = 0; i < 20; ++i) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  console.log(
    `[${getTimeMs()}] Serializing response for request ${requestIndex}...`
  );
  const serializedBigObject = JSON.stringify(bigObject);

  const flushStartTimeMs = Date.now();
  res.on("finish", () => {
    const flushDurationMs = Date.now() - flushStartTimeMs;
    console.log(
      `[${getTimeMs()}] -- Took ${flushDurationMs}ms to flush response for request ${requestIndex} --`
    );
  });

  // setSendBufferSize(res);

  console.log(
    `[${getTimeMs()}] Sending ${Math.round(
      serializedBigObject.length / 1024 / 1024
    )}MB response for request ${requestIndex}...`
  );

  // TODO(xue): this doesn't work, res can't be passed in message
  // responseSendWorkerThread.postMessage({
  //   res: res,
  //   serializedResponse: serializedBigObject,
  // });
  res.send(serializedBigObject);
  // res.send("ok");

  console.log(`[${getTimeMs()}] - Handler done for request ${requestIndex} -`);

  // TODO(xue): replace this with more concise log line?
  // wtf.dump();
}

app.get("/", async (req, res) => {
  const requestIndex = ++requestCount;
  requestHandler({ requestIndex, req, res });
  // requestQueue.push({ requestIndex, req, res });
});

app.listen("/tmp/sock", () =>
  console.log(`Example app listening on Unix domain socket /tmp/sock!`)
);
// app.listen(3000, () => console.log(`Example app listening on port ${3000}!`));
