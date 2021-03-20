const { isMainThread, parentPort, workerData } = require("worker_threads");
const assert = require("assert");

assert(isMainThread === false);

class ResponseSendThread {
  _parentPort;
  _intervalId;

  constructor(parentPort) {
    this._parentPort = parentPort;
    this._parentPort.on("message", this.onParentMessage.bind(this));
  }

  onParentMessage(message) {
    const res = message.res;
    const serializedResponse = message.serializedResponse;
    res.send(serializedResponse);
  }

  start() {
    this._intervalId = setInterval(() => {
      console.log("response send thread running...");
    }, 5 * 1000);
  }

  stop() {
    clearInterval(this._intervalId);
  }
}

const responseSendThread = new ResponseSendThread(parentPort);
responseSendThread.start();
