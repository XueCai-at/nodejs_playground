import async_hooks from "async_hooks";
import fs from "fs";
import assert from "assert";
import { debug } from "console";

// PIPESERVERWRAP -> PIPEWRAP
// PIPEWRAP -> HTTPINCOMINGMESSAGE (requestAsyncId)
// PIPEWRAP -> WRITEWRAP (res.on('finish')) -> TickObject (res.on('close'))

const infoByAsyncId = new Map();
const cpuTimeByAsyncId = new Map();
const beforeTimestampByAsyncId = new Map();
const cpuTimeByRequestAsyncId = new Map();

const requestContextByAsyncId = new Map();
export function createRequestContext(data) {
  requestContextByAsyncId.set(async_hooks.executionAsyncId(), data);
}
export function getRequestContext(executionAsyncId = null) {
  // log(
  //   "getRequestContext",
  //   `executionAsyncId: ${async_hooks.executionAsyncId()}, triggerAsyncId: ${async_hooks.triggerAsyncId()}`
  // );
  let asyncId = executionAsyncId;
  if (asyncId === null) {
    asyncId = async_hooks.executionAsyncId();
  }
  return requestContextByAsyncId.get(asyncId);
}

function elapsedMsSince(hrtime) {
  const now = process.hrtime.bigint();
  return elapsedMsBetween(hrtime, now);
}
function elapsedMsBetween(start, end) {
  return Math.round(Number(end - start) / 1e6);
}

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

function increaseCpuTimeByAsyncId(cpuTimeById, id, durationMs) {
  const currentCpuTime = cpuTimeById.get(id);
  if (currentCpuTime === undefined) {
    cpuTimeById.set(id, durationMs);
  } else {
    cpuTimeById.set(id, currentCpuTime + durationMs);
  }
}

// Sync write to the console
const log = (phase, msg, verbose = true) => {
  if (verbose) {
    fs.writeSync(
      1,
      `Phase: "${phase}", executionAsyncId: ${async_hooks.executionAsyncId()}: ${msg}\n`
    );
  }
};

export function enableRequestContextAsyncHook(verbose = true) {
  const asyncHook = async_hooks.createHook({
    init(asyncId, type, triggerAsyncId, resource) {
      log(
        "Init",
        `asyncId: ${asyncId}, type: "${type}", triggerAsyncId: ${triggerAsyncId}, resource: ${resource.constructor.name}`,
        verbose
      );
      // if (verbose) {
      //   debug(resource);
      // }
      infoByAsyncId.set(asyncId, {
        type,
        triggerAsyncId,
      });
      // All descendant async resources of the request resource will share the same context
      if (requestContextByAsyncId.has(triggerAsyncId)) {
        requestContextByAsyncId.set(
          asyncId,
          requestContextByAsyncId.get(triggerAsyncId)
        );
      }
    },
    before(asyncId) {
      log("Before", `asyncId: ${asyncId}`, verbose);
      beforeTimestampByAsyncId.set(asyncId, process.hrtime.bigint());
    },
    after(asyncId) {
      log("After", `asyncId: ${asyncId}`, verbose);
      const beforeTimestamp = beforeTimestampByAsyncId.get(asyncId);
      assert(beforeTimestamp !== undefined);
      const durationMs = elapsedMsSince(beforeTimestamp);

      increaseCpuTimeByAsyncId(cpuTimeByAsyncId, asyncId, durationMs);
      const requestAsyncId = getRequestAsyncId(asyncId);
      increaseCpuTimeByAsyncId(
        cpuTimeByRequestAsyncId,
        requestAsyncId,
        durationMs
      );

      const requestContext = requestContextByAsyncId.get(asyncId);
      if (requestContext) {
        const currentCpuTime = requestContext["totalCpuTime"];
        if (currentCpuTime === undefined) {
          requestContext["totalCpuTime"] = durationMs;
        } else {
          requestContext["totalCpuTime"] = currentCpuTime + durationMs;
        }
      }
    },
    destroy(asyncId) {
      log("Destroy", `asyncId: ${asyncId}`, verbose);

      log(
        "Destroy",
        `cpuTimeByAsyncId: ${JSON.stringify(
          Array.from(cpuTimeByAsyncId.entries())
        )}`,
        verbose
      );
      log(
        "Destroy",
        `cpuTimeByRequestAsyncId: ${JSON.stringify(
          Array.from(cpuTimeByRequestAsyncId.entries())
        )}`,
        verbose
      );
      log(
        "Destroy",
        `requestContextByAsyncId: ${JSON.stringify(
          Array.from(requestContextByAsyncId.entries())
        )}`,
        verbose
      );

      infoByAsyncId.delete(asyncId);
      cpuTimeByAsyncId.delete(asyncId);
      beforeTimestampByAsyncId.delete(asyncId);
      cpuTimeByRequestAsyncId.delete(asyncId);

      requestContextByAsyncId.delete(asyncId);
    },
  });
  asyncHook.enable();
}
