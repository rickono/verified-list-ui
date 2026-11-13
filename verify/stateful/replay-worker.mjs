import { machineOf } from "./machine.mjs";
import { executeNative } from "./native.mjs";

// Nothing in the application realm can access IPC or a host callback. The
// parent additionally kills this process if V8 cannot return from a turn.
let machine;
process.on("message", (message) => {
  try {
    if (message.type === "init") { machine = machineOf(message.file, message.source); process.send({ id: message.id, ready: true }); }
    else if (message.type === "replay" && machine) process.send({ id: message.id, result: executeNative(machine, message.trace, message.timeoutMs) });
    else throw new Error("Invalid replay protocol");
  } catch (e) { process.send({ id: message.id, result: { status: "unknown", reason: "replay-runtime", message: e.message } }); }
});
