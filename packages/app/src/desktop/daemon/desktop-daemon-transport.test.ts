import { describe, expect, it, vi } from "vitest";
import {
  buildDesktopDaemonTransportUrl,
  createDesktopDaemonTransportFactory,
} from "./desktop-daemon-transport";
import { createFakeLocalDaemonTransportRpc } from "./test-local-daemon-transport-rpc";

const LOCAL_URL = "paseo+desktop://socket?path=%2Ftmp%2Fpaseo.sock";

describe("desktop-daemon-transport", () => {
  it("uses the main-process event as readiness when it races registration", async () => {
    const rpc = createFakeLocalDaemonTransportRpc();
    const cleanup = vi.fn();
    const transportFactory = createDesktopDaemonTransportFactory(rpc);
    expect(transportFactory).not.toBeNull();

    const transport = transportFactory!({ url: LOCAL_URL });

    const onOpen = vi.fn();
    transport.onOpen(onOpen);

    rpc.resolveListen(cleanup);
    await Promise.resolve();

    const sessionId = rpc.openCalls[0]?.sessionId ?? "";
    expect(sessionId).not.toBe("");
    rpc.emitEvent({ sessionId, kind: "open" });
    expect(onOpen).toHaveBeenCalledTimes(1);

    rpc.resolveRegistration();
    await Promise.resolve();

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not start a session when listener setup finishes after close", async () => {
    const rpc = createFakeLocalDaemonTransportRpc();
    const cleanup = vi.fn();

    const transportFactory = createDesktopDaemonTransportFactory(rpc);
    expect(transportFactory).not.toBeNull();

    const transport = transportFactory!({ url: LOCAL_URL });

    transport.close();

    rpc.resolveListen(cleanup);
    await Promise.resolve();
    await Promise.resolve();

    expect(rpc.openCalls).toHaveLength(0);
    expect(rpc.closedSessions).toHaveLength(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("cancels a registered session while readiness is pending", async () => {
    const rpc = createFakeLocalDaemonTransportRpc();
    const transportFactory = createDesktopDaemonTransportFactory(rpc);
    expect(transportFactory).not.toBeNull();

    const transport = transportFactory!({ url: LOCAL_URL });
    rpc.resolveListen(vi.fn());
    await Promise.resolve();

    const sessionId = rpc.openCalls[0]?.sessionId ?? "";
    expect(sessionId).not.toBe("");

    transport.close();

    expect(rpc.closedSessions).toEqual([sessionId]);
  });

  it("emits text and binary frames without a base64 round trip", async () => {
    const rpc = createFakeLocalDaemonTransportRpc();
    const transportFactory = createDesktopDaemonTransportFactory(rpc);
    const transport = transportFactory!({ url: LOCAL_URL });
    const onMessage = vi.fn();
    transport.onMessage(onMessage);
    rpc.resolveListen(vi.fn());
    await Promise.resolve();

    const sessionId = rpc.openCalls[0]?.sessionId ?? "";
    rpc.emitEvent({ sessionId, kind: "open" });
    rpc.emitEvent({ sessionId, kind: "message", text: '{"type":"ping"}' });
    rpc.emitEvent({ sessionId, kind: "message", binary: new Uint8Array([0, 255, 1]) });

    expect(onMessage).toHaveBeenNthCalledWith(1, '{"type":"ping"}', false);
    expect(onMessage).toHaveBeenNthCalledWith(2, new Uint8Array([0, 255, 1]), true);
  });

  it("sends text and binary frames through the RPC as native values", async () => {
    const rpc = createFakeLocalDaemonTransportRpc();
    const transportFactory = createDesktopDaemonTransportFactory(rpc);
    const transport = transportFactory!({ url: LOCAL_URL });
    rpc.resolveListen(vi.fn());
    await Promise.resolve();

    const sessionId = rpc.openCalls[0]?.sessionId ?? "";
    rpc.emitEvent({ sessionId, kind: "open" });
    transport.send('{"type":"ping"}');
    transport.send(new Uint8Array([0, 255, 1]));

    expect(rpc.recordedSends).toEqual([
      { sessionId, text: '{"type":"ping"}' },
      { sessionId, binary: new Uint8Array([0, 255, 1]) },
    ]);
  });

  it("passes Remote SSH parameters to the desktop transport bridge", async () => {
    const rpc = createFakeLocalDaemonTransportRpc();
    const transportFactory = createDesktopDaemonTransportFactory(rpc);
    expect(transportFactory).not.toBeNull();

    const url = buildDesktopDaemonTransportUrl({
      transportType: "ssh",
      host: "deploy@example.com",
      sshPort: 2222,
      daemonPort: 7777,
    });
    transportFactory!({ url });
    rpc.resolveListen(vi.fn());
    await Promise.resolve();

    expect(rpc.openCalls).toHaveLength(1);
    expect(rpc.openCalls[0]?.target).toEqual({
      transportType: "ssh",
      host: "deploy@example.com",
      sshPort: 2222,
      daemonPort: 7777,
    });
  });

  it.each([0, 65536])("rejects an out-of-range Remote SSH port (%s)", (sshPort) => {
    const transportFactory = createDesktopDaemonTransportFactory(
      createFakeLocalDaemonTransportRpc(),
    );
    expect(transportFactory).not.toBeNull();

    const url = buildDesktopDaemonTransportUrl({
      transportType: "ssh",
      host: "deploy@example.com",
      sshPort,
    });

    expect(() => transportFactory!({ url })).toThrow("Invalid SSH transport target");
  });
});
