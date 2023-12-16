import type { NextServer, NextServerOptions } from "next/dist/server/next.js";
import type { RequestHandler } from "../handler.js";
import { defineProperties } from "../util.js";

/**
 * Create config to Nextjs pages
 *
 * in config set full pages path `dir`, and current middle path
 *
 * @example
 * {
 *  dir: "/root/nextjs_example",
 *  conf: {
 *    basePath: "/foo/bar/page_next"
 *  }
 * }
 *
 * @param config - Next config
 * @returns
 */
export async function nextjsPages(config: Omit<NextServerOptions, "customServer">): Promise<RequestHandler> {
  const app = ((await import("next")).default as any as (options: NextServerOptions) => NextServer)({
    ...config,
    customServer: true,
    dir: "/root/nextjs_example",
    conf: {
      basePath: "/page_next"
    }
  });
  await app.prepare();
  const handler = await app.getRequestHandler();
  return (req, res) => handler(defineProperties(req, {
    "url": {
      writable: true,
      configurable: true,
      enumerable: true,
      value: String().concat(req.path, ...(Object.keys(req.query).length > 0 ? [ "?", Object.keys(req.query).map(k => String().concat(k, "=", req.query[k])).join("&") ] : []))
    }
  }), res);
}