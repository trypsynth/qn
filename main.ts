import { serveDir } from "https://deno.land/std@0.220.1/http/file_server.ts";
import * as Y from "npm:yjs";

const PORT = 8000;
const doc = new Y.Doc();
const connections = new Set<WebSocket>();

doc.on("update", (update: Uint8Array, origin) => {
  for (const socket of connections) {
    if (socket === origin) {
      continue;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(update);
    }
  }
});

function handleWebSocket(req: Request): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);
  connections.add(socket);
  const sendState = () => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(Y.encodeStateAsUpdate(doc));
    }
  };
  if (socket.readyState === WebSocket.OPEN) {
    sendState();
  } else {
    socket.addEventListener("open", sendState, { once: true });
  }
  socket.onmessage = (event: MessageEvent) => {
    if (typeof event.data === "string") {
      return;
    }
    const update = new Uint8Array(event.data as ArrayBuffer);
    Y.applyUpdate(doc, update, socket);
  };
  const cleanup = () => connections.delete(socket);
  socket.onclose = cleanup;
  socket.onerror = cleanup;
  return response;
}

const handler = (req: Request) => {
  const { pathname } = new URL(req.url);
  if (pathname === "/ws") {
    return handleWebSocket(req);
  }
  return serveDir(req, { fsRoot: "public", urlRoot: "", quiet: true });
};

Deno.serve({ port: PORT }, handler);
