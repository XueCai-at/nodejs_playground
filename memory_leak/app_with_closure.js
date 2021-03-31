import express from "express";

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

const app = express();
let requestCount = 0;

function getBigObjectClosureFunc() {
  let obj = makeBigObject(2000, 2);
  function closureFunc() {
    return obj;
  }
  return closureFunc();
}

const allClosureFuncs = new Map();

async function requestHandler({ requestIndex, req, res }) {
  allClosureFuncs.set(requestIndex, getBigObjectClosureFunc());

  const mem = process.memoryUsage();
  console.log(`Process memory usage: ${JSON.stringify(mem)}`);
}

app.get("/", async (req, res) => {
  const requestIndex = ++requestCount;
  requestHandler({ requestIndex, req, res });
});

app.listen("/tmp/sock", () =>
  console.log(`Example app listening on Unix domain socket /tmp/sock!`)
);
