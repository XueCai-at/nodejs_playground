import express from "express";

function elapsedMsSince(hrtime) {
  const now = process.hrtime.bigint();
  return elapsedMsBetween(hrtime, now);
}
function elapsedMsBetween(start, end) {
  return Math.round(Number(end - start) / 1e6);
}

///////////////////// Async Hooks ////////////////////////
import async_hooks from "async_hooks";
import fs from "fs";
import assert from "assert";
import { debug } from "console";

const infoByAsyncId = new Map();
const cpuTimeByAsyncId = new Map();
const beforeTimestampByAsyncId = new Map();

const cpuTimeByRequestAsyncId = new Map();

function getRequestAsyncId(asyncId) {
  let currentAsyncId = asyncId;
  while (true) {
    const info = infoByAsyncId.get(currentAsyncId);
    if (info === undefined) {
      return null;
    }
    if (info.type === "HTTPINCOMINGMESSAGE") {
      return currentAsyncId;
    }
    currentAsyncId = info.triggerAsyncId;
  }
}

function setCpuTime(cpuTimeById, id, durationMs) {
  const totalCpuTime = cpuTimeById.get(id);
  if (totalCpuTime === undefined) {
    cpuTimeById.set(id, durationMs);
  } else {
    cpuTimeById.set(id, totalCpuTime + durationMs);
  }
}

// Sync write to the console
const writeSomething = (phase, more) => {
  fs.writeSync(
    process.stdout.fd,
    `Phase: "${phase}", Exec. Id: ${async_hooks.executionAsyncId()} ${
      more ? ", " + more : ""
    }\n`
  );
};

const timeoutHook = async_hooks.createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    writeSomething(
      "Init",
      `asyncId: ${asyncId}, type: "${type}", triggerAsyncId: ${triggerAsyncId}, resource: ${resource.constructor.name}`
    );
    infoByAsyncId.set(asyncId, {
      type,
      triggerAsyncId,
    });
    debug(resource);
  },
  before(asyncId) {
    writeSomething("Before", `asyncId: ${asyncId}`);
    beforeTimestampByAsyncId.set(asyncId, process.hrtime.bigint());
  },
  after(asyncId) {
    writeSomething("After", `asyncId: ${asyncId}`);
    const beforeTs = beforeTimestampByAsyncId.get(asyncId);
    assert(beforeTs !== undefined);
    const durationMs = elapsedMsSince(beforeTs);

    setCpuTime(cpuTimeByAsyncId, asyncId, durationMs);

    const requestAsyncId = getRequestAsyncId(asyncId);
    setCpuTime(cpuTimeByRequestAsyncId, requestAsyncId, durationMs);
  },
  destroy(asyncId) {
    writeSomething("Destroy", `asyncId: ${asyncId}`);
  },
});
timeoutHook.enable();
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
// const bigObject = makeBigObject(24, 2);  // < 8K
let requestCount = 0;
let firstRequestStartTime;

async function serialize(bigObject) {
  return JSON.stringify(bigObject);
}

async function requestHandler({ requestIndex, req, res }) {
  if (requestIndex === 1) {
    firstRequestStartTime = Date.now();
  }

  console.log(
    `[${getTimeMs()}] Serializing response for request ${requestIndex}...`
  );
  // const serializedBigObject = JSON.stringify(bigObject);
  const serializedBigObject = await serialize(bigObject);

  const flushStartTimeMs = Date.now();
  res.on("finish", () => {
    const flushDurationMs = Date.now() - flushStartTimeMs;
    console.log(
      `[${getTimeMs()}] -- Took ${flushDurationMs}ms to flush response for request ${requestIndex} --`
    );
  });
  res.on("close", () => {
    console.log(
      `cpuTimeByAsyncId: ${JSON.stringify(
        Array.from(cpuTimeByAsyncId.entries())
      )}`
    );
    console.log(
      `cpuTimeByRequestAsyncId: ${JSON.stringify(
        Array.from(cpuTimeByRequestAsyncId.entries())
      )}`
    );
  });

  console.log(
    `[${getTimeMs()}] Sending ${Math.round(
      serializedBigObject.length / 1024 / 1024
    )}MB response for request ${requestIndex}...`
  );
  res.send(serializedBigObject);
  // res.send("ok");

  console.log(`[${getTimeMs()}] - Handler done for request ${requestIndex} -`);
}

app.get("/", async (req, res) => {
  const requestIndex = ++requestCount;
  requestHandler({ requestIndex, req, res });
});

app.listen("/tmp/sock", () =>
  console.log(`Example app listening on Unix domain socket /tmp/sock!`)
);
