import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import app from "./app";

type AppwriteContext = {
  req: {
    body: Record<string, unknown>;
    bodyRaw: string;
    headers: Record<string, string>;
    method: string;
    url: string;
    path: string;
    port: number;
    scheme: string;
    host: string;
    queryString: string;
    query: Record<string, string>;
  };
  res: {
    send: (body: string, statusCode?: number, headers?: Record<string, string>) => void;
    json: (obj: unknown, statusCode?: number, headers?: Record<string, string>) => void;
    empty: () => void;
    redirect: (url: string, statusCode?: number) => void;
  };
  log: (msg: string) => void;
  error: (msg: string) => void;
};

export default async function handler({ req, res, log, error }: AppwriteContext) {
  const url = req.queryString ? `${req.path}?${req.queryString}` : req.path;

  const nodeReq = Object.assign(new IncomingMessage(new Socket()), {
    method: req.method,
    url,
    headers: req.headers,
  });

  if (req.bodyRaw) {
    nodeReq.push(req.bodyRaw);
  }
  nodeReq.push(null);

  const chunks: Buffer[] = [];

  const nodeRes = new ServerResponse(nodeReq);

  (nodeRes as any).write = (chunk: any) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  };

  (nodeRes as any).end = (chunk?: any) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    nodeRes.emit("finish");
    return nodeRes;
  };

  await new Promise<void>((resolve) => {
    (app as any).handle(nodeReq, nodeRes, resolve);
    nodeRes.once("finish", resolve);
  });

  const body = Buffer.concat(chunks).toString("utf-8");

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(nodeRes.getHeaders())) {
    if (value !== undefined) {
      headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
    }
  }

  return res.send(body, nodeRes.statusCode ?? 200, headers);
}
