// const express = require("express");
// const wtf = require("wtfnode");
import express from "express";
import wtf from "wtfnode";

const app = express();

////////////////// Async hooks /////////////////////
import {
  createRequestContext,
  getRequestContext,
  setRequestContext,
  enableRequestContextAsyncHook,
} from "./request_context.js";
enableRequestContextAsyncHook(false);

app.use(async (req, res, next) => {
  const data = {}; // can put req info here
  const requestContext = createRequestContext(data);

  res.on("close", () => {
    console.log(
      `[${getTimeMs()}] Request context: ${requestContext.toString()}`
    );
  });

  next();
});
//////////////////////////////////////////////////////////

////////////////// Event loop blockers /////////////////////
import { syncAvg, asyncAvg } from "./block_event_loop/partition_calculation.js";
import {
  makeBigObj,
  encryptToBase64String,
  decryptFromBase64String,
} from "./block_event_loop/encryption.js";
//////////////////////////////////////////////////////////

////////////////// setSendBufferSize /////////////////////
// const os = require("os");
// const ref = require("ref-napi");
// const ffi = require("ffi-napi");
import os from "os";
import ref from "ref-napi";
import ffi from "ffi-napi";

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
// const async = require("async");
import async from "async";

const requestQueue = async.queue(async function (task, callback) {
  await requestHandler(task);
  callback();
}, 1);
//////////////////////////////////////////////////////////

////////////////// worker threads /////////////////////
// // const { Worker } = require("worker_threads");
// import {Worker} from 'worker_threads';

// const responseSendWorkerThread = new Worker("./response_send_thread.js");
// // responseSendWorkerThread.on("message", () => {});
// // responseSendWorkerThread.on("error", () => {});
// responseSendWorkerThread.on("exit", (code) => {
//   console.log(`responseSendWorkerThread exited. code: ${code}`);
// });
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

const bigObject = makeBigObject(2000, 2);
const serializedBigObject = JSON.stringify(bigObject);
// const encryptedSerializedBigObject = encryptToBase64String(serializedBigObject);
const encryptedSerializedBigObject = encryptToBase64String(
  JSON.stringify(makeBigObj())
);
let requestCount = 1;
let firstRequestStartTime;

async function requestHandler({ requestIndex, req, res, requestContext }) {
  if (requestIndex === 1) {
    firstRequestStartTime = Date.now();
  }

  console.log(`[${getTimeMs()}] Processing request ${requestIndex}...`);

  requestContext.setRequestId(requestIndex);
  setRequestContext(requestContext);

  // 115+8KB or 13+4MB
  // for (let i = 0; i < 20; ++i) {
  //   await new Promise((resolve) => setTimeout(resolve, 1));
  // }

  // console.log(`[${getTimeMs()}] Computing for request ${requestIndex}...`);
  // syncAvg(1000000000);
  // asyncAvg(1000000000, function (avg) {
  //   console.log("async avg: " + avg);
  // });

  await new Promise((resolve) => setTimeout(resolve, 1));

  console.log(`[${getTimeMs()}] Decrypting for request ${requestIndex}...`);
  requestContext.addTagsToCurrentExecutionAsyncId("decryptFromBase64String");
  decryptFromBase64String(encryptedSerializedBigObject);

  await new Promise((resolve) => setTimeout(resolve, 1));

  console.log(
    `[${getTimeMs()}] Serializing response for request ${requestIndex}...`
  );
  requestContext.addTagsToCurrentExecutionAsyncId("serialize");
  const serializedBigObject = JSON.stringify(bigObject);

  await new Promise((resolve) => setTimeout(resolve, 1));

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
  const requestIndex = requestCount++;
  // Need to get request context here, because async.queue will mess it up
  const requestContext = getRequestContext();

  // requestHandler({ requestIndex, req, res, requestContext});

  requestQueue.push({ requestIndex, req, res, requestContext });
});

app.listen("/tmp/sock", () =>
  console.log(`Example app listening on Unix domain socket /tmp/sock!`)
);
// app.listen(3000, () => console.log(`Example app listening on port ${3000}!`));
