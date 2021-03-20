const express = require("express");

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

async function requestHandler({ requestIndex, req, res }) {
  if (requestIndex === 1) {
    firstRequestStartTime = Date.now();
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
