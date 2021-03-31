import async_hooks from "async_hooks";
import fs from "fs";
import assert from "assert";
import { debug } from "console";

// A request's asyncId tree roughly looks like (assuming requests are coming via a Unix domain socket):
// TODO(xue): add one for TCP socket
// - PIPESERVERWRAP -> PIPEWRAP
// - PIPEWRAP -> HTTPINCOMINGMESSAGE (requestAsyncId) -> all other async resources created in the request handler
// - PIPEWRAP -> WRITEWRAP (res.on('finish')) -> TickObject (res.on('close'))

// If using async.queue(), the request's asyncId tree will be messed up.
// To solve it, we need to pass requestContext explicitly and reset it in queue task handler.
// - HTTPINCOMINGMESSAGE (requestAsyncId of request 1) -> Immediate (queue task of request 1) -> PromiseWrap -> PromiseWrap (queue task of request 2)
// But we still have
// - PIPEWRAP -> WRITEWRAP (res.on('finish')) -> TickObject (res.on('close'))

const VERBOSE = false;

const requestContextByAsyncId = new Map();
// We can't put beginTimeByAsyncId in RequestContext because `before` can be called before `createRequestContext`
const beginTimeByAsyncId = new Map();

class RequestContext {
  _data;
  _requestId;
  _requestAsyncId;
  _totalCpuTime;
  _totalCpuTimeByAsyncId;
  _tagsByAsyncId;

  constructor(data) {
    this._data = data;
    this._requestId = null;
    this._requestAsyncId = async_hooks.executionAsyncId();
    this._totalCpuTime = 0;
    this._totalCpuTimeByAsyncId = new Map();
    this._tagsByAsyncId = new Map();
  }

  setRequestId(requestId) {
    this._requestId = requestId;
  }

  increaseCpuTime(durationMs) {
    this._totalCpuTime += durationMs;
  }

  increaseCpuTimeByAsyncId(asyncId, durationMs) {
    const currentCpuTime = this._totalCpuTimeByAsyncId.get(asyncId);
    if (currentCpuTime === undefined) {
      this._totalCpuTimeByAsyncId.set(asyncId, durationMs);
    } else {
      this._totalCpuTimeByAsyncId.set(asyncId, currentCpuTime + durationMs);
    }
  }

  addTagsToCurrentExecutionAsyncId(tag) {
    const asyncId = async_hooks.executionAsyncId();
    log(
      "addTagsToCurrentExecutionAsyncId",
      `tag: ${tag}, executionAsyncId: ${async_hooks.executionAsyncId()}, triggerAsyncId: ${async_hooks.triggerAsyncId()}`,
      VERBOSE
    );
    const tags = this._tagsByAsyncId.get(asyncId);
    if (tags) {
      tags.add(tag);
    } else {
      this._tagsByAsyncId.set(asyncId, new Set([tag]));
    }
  }

  toString() {
    let summary = `requestId: ${this._requestId}, requestAsyncId: ${
      this._requestAsyncId
    }, totalCpuTime: ${this._totalCpuTime}, data: ${JSON.stringify(
      this._data
    )}\n`;
    for (const [asyncId, cpuTime] of this._totalCpuTimeByAsyncId.entries()) {
      const tags = this._tagsByAsyncId.get(asyncId);
      summary += `  - asyncId: ${asyncId}, cpuTime: ${cpuTime}, tags: ${
        tags ? JSON.stringify(Array.from(tags.keys())) : ""
      }\n`;
    }
    return summary;
  }
}

export function createRequestContext(data) {
  log(
    "createRequestContext",
    `executionAsyncId: ${async_hooks.executionAsyncId()}, triggerAsyncId: ${async_hooks.triggerAsyncId()}`,
    VERBOSE
  );
  const requestContext = new RequestContext(data);
  requestContextByAsyncId.set(async_hooks.executionAsyncId(), requestContext);
  return requestContext;
}
export function getRequestContext() {
  log(
    "getRequestContext",
    `executionAsyncId: ${async_hooks.executionAsyncId()}, triggerAsyncId: ${async_hooks.triggerAsyncId()}`,
    VERBOSE
  );
  return requestContextByAsyncId.get(async_hooks.executionAsyncId());
}
export function setRequestContext(requestContext) {
  const currentRequestContext = requestContextByAsyncId.get(
    async_hooks.executionAsyncId()
  );
  if (
    currentRequestContext &&
    currentRequestContext._requestAsyncId === requestContext._requestAsyncId
  ) {
    return;
  }
  log(
    "setRequestContext",
    `requestContext: ${
      requestContext._requestAsyncId
    }, executionAsyncId: ${async_hooks.executionAsyncId()}, triggerAsyncId: ${async_hooks.triggerAsyncId()}`,
    VERBOSE
  );
  requestContextByAsyncId.set(async_hooks.executionAsyncId(), requestContext);
}

function elapsedMsSince(hrtime) {
  const now = process.hrtime.bigint();
  return elapsedMsBetween(hrtime, now);
}
function elapsedMsBetween(start, end) {
  return Math.round(Number(end - start) / 1e6);
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
      beginTimeByAsyncId.set(asyncId, process.hrtime.bigint());
    },
    after(asyncId) {
      log("After", `asyncId: ${asyncId}`, verbose);
      const beforeTime = beginTimeByAsyncId.get(asyncId);
      assert(beforeTime !== undefined);
      const durationMs = elapsedMsSince(beforeTime);

      const requestContext = requestContextByAsyncId.get(asyncId);
      if (requestContext) {
        requestContext.increaseCpuTime(durationMs);
        requestContext.increaseCpuTimeByAsyncId(asyncId, durationMs);

        if (durationMs > 100) {
          const tags = requestContext._tagsByAsyncId.get(asyncId);
          fs.writeSync(
            1,
            `Long synchronous operation (${durationMs}ms)! requestAsyncId: ${
              requestContext._requestAsyncId
            }, asyncId: ${asyncId}, tags: ${
              tags ? JSON.stringify(Array.from(tags.keys())) : ""
            }\n`
          );
        }
      }
    },
    destroy(asyncId) {
      log("Destroy", `asyncId: ${asyncId}`, verbose);
      requestContextByAsyncId.delete(asyncId);
      beginTimeByAsyncId.delete(asyncId);
    },
  });
  asyncHook.enable();
}
