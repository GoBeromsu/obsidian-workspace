import { spawn } from "node:child_process";
import type { RemoteRunner } from "../types/remote-command";
import { applyPrefixBound, decodeUtf8Prefix } from "../domain/response-bound";

/**
 * `RemoteRunner` backed by a real child process.
 *
 * argv only, never a shell string, so the local shell cannot interpret anything. The byte bound is
 * applied while streaming: on reaching `maxBytes` the child is asked to terminate. That request,
 * the timeout and refusing over-bound payloads are the guarantees - not a promise about how many
 * bytes already crossed the network.
 */
export const childProcessRunner: RemoteRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { stdio: ["ignore", "pipe", "pipe"] });

    const stdoutChunks: Uint8Array[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let capExceeded = false;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`remote command timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (capExceeded) return;
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > options.maxBytes) {
        capExceeded = true;
        child.kill("SIGTERM");
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 8192) stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const joined = Buffer.concat(stdoutChunks);
      const bounded = applyPrefixBound(new Uint8Array(joined), options.maxBytes - 1);
      resolve({
        stdout: decodeUtf8Prefix(bounded.bytes),
        stderr,
        exitCode: capExceeded ? 0 : code,
        capExceeded: capExceeded || bounded.capExceeded,
      });
    });
  });
