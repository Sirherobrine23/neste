import cookie from "cookie";
import { IncomingMessage, ServerResponse, STATUS_CODES } from "http";
import { isIP } from "net";
import { posix } from "path";
import { MatchFunction, ParseOptions, RegexpToFunctionOptions, TokensToRegexpOptions, match as regexMatch } from "path-to-regexp";
import stream from "stream";
import { parse } from "url";
import { WebSocket } from "ws";
import yaml from "yaml";
import { Router } from "./application.js";
import * as ranger from "./ranger.js";
import { defineProperties, mixin } from "./util.js";

export class CookieManeger extends Map<string, [string, cookie.CookieSerializeOptions]> {
  constructor(public initialCookies: string) {
    super();
    if (!initialCookies) return;
    this.fromString(initialCookies);
  }

  // @ts-ignore
  set(key: string, value: string, opts?: cookie.CookieSerializeOptions): this {
    super.set(key, [value, opts || {}]);
    return this;
  }

  toString() {
    const parsed = cookie.parse(this.initialCookies);
    return Array.from(this.entries()).filter(([key, [value]]) => parsed[key] && parsed[key] !== value).map(([key, [value, opt]]) => cookie.serialize(key, value, opt)).join("; ");
  }

  fromString(cookieHead: string): this {
    const parsed = cookie.parse(cookieHead);
    Object.keys(parsed).forEach(k => this.set(k, parsed[k]));
    return this;
  }

  get sizeDiff() {
    const parsed = cookie.parse(this.initialCookies);
    return Array.from(this.entries()).filter(([key, [value]]) => parsed[key] && parsed[key] !== value).length;
  }

  toJSON() {
    return Array.from(this.entries()).map(([key, [value, opt]]) => ({ key, value, options: opt }));
  }
}

export interface Request extends IncomingMessage {
  app: Router;
  res: Response;
  protocol: "https"|"http";
  secure: boolean;
  path: string;
  reqPath: string;
  ip?: string;
  hostname?: string;
  subdomains?: string[];

  Cookies: CookieManeger;
  query: Record<string, string>;
  params: Record<string, string>;
  body?: any;
}

export class Request {
  /**
   * Return request header.
   *
   * The `Referrer` header field is special-cased,
   * both `Referrer` and `Referer` are interchangeable.
   *
   * Examples:
   *
   *     req.get('Content-Type');
   *     // => "text/plain"
   *
   *     req.get('content-type');
   *     // => "text/plain"
   *
   *     req.get('Something');
   *     // => undefined
   *
   */
  get(name: string): string|string[]|undefined {
    if (!name || typeof name !== "string") throw new TypeError("name must be a string to req.get");
    return this.headers[name.toLowerCase()] || this.headers[name];
  }

  /**
   * Check if the incoming request contains the "Content-Type"
   * header field, and it contains the given mime `type`.
   *
   * Examples:
   *
   *      // With Content-Type: text/html; charset=utf-8
   *      req.is('html');
   *      req.is('text/html');
   *      req.is('text/*');
   *      // => true
   *
   *      // When Content-Type is application/json
   *      req.is('json');
   *      req.is('application/json');
   *      req.is('application/*');
   *      // => true
   *
   *      req.is('html');
   *      // => false
   *
   */
  is(str: (string[])|string): boolean {
    if (typeof str === "string") return String(this.headers["content-type"]||"").includes(str);
    for (let st of str) if (String(this.get("content-type")||"").includes(st)) return true;
    return false;
  }

  /**
   * Parse Range header field, capping to the given `size`.
   *
   * Unspecified ranges such as "0-" require knowledge of your resource length. In
   * the case of a byte range this is of course the total number of bytes. If the
   * Range header field is not given `undefined` is returned, `-1` when unsatisfiable,
   * and `-2` when syntactically invalid.
   *
   * When ranges are returned, the array has a "type" property which is the type of
   * range that is required (most commonly, "bytes"). Each array element is an object
   * with a "start" and "end" property for the portion of the range.
   *
   * The "combine" option can be set to `true` and overlapping & adjacent ranges
   * will be combined into a single range.
   *
   * NOTE: remember that ranges are inclusive, so for example "Range: users=0-3"
   * should respond with 4 users when available, not 3.
   */
  range(size: number, options?: ranger.Options): ranger.Result|ranger.Ranges {
    const range = this.get("Range");
    if (!range || typeof range !== "string") return undefined;
    return ranger.rangeParser(size, range, options);
  }
}

export const codes = STATUS_CODES;

export interface Response extends Omit<ServerResponse, "req"> {
  req: Request;
  app: Router;
}
export class Response {
  set(key: string, value: string|string[]|number) {
    this.setHeader(key, value);
    return this;
  }

  get(key: string): string | string[] | number {
    return this.getHeader(key);
  }

  has(key: string) {
    return !!(this.hasHeader(key)||this.hasHeader(key.toLocaleLowerCase()));
  }

  status(statusCode: number) {
    if (!(statusCode > 0)) throw new TypeError("Set valid code status");
    this.statusCode = statusCode;
    return this;
  }

  /**
   * Send given HTTP status code.
   *
   * Sets the response status to `statusCode` and the body of the
   * response to the standard description from node's http.STATUS_CODES
   * or the statusCode number if no description.
   *
   * Examples:
   *
   *     res.sendStatus(200);
   *
   * @param statusCode
   * @public
   */
  sendStatus(statusCode: number) {
    if (!(statusCode > 0)) throw new TypeError("Set valid code status");
    this.statusCode = statusCode;
    return this.send(codes[statusCode]||String(statusCode));
  }

  /**
   * Send JSON response.
   *
   * Examples:
   *
   *     res.json(null);
   *     res.json({ user: 'tj' });
   */
  json(obj: any) {
    if (!(obj && typeof obj === "object")) throw new TypeError("Require body object");
    else if (!(this.has("Content-Type"))) this.set("Content-Type", "application/json")

    // settings
    const escape = this.app.settings.get("json escape")
    const replacer = this.app.settings.get("json replacer");
    const spaces = this.app.settings.get("json space");

    // JSON Body
    let jsonBody = JSON.stringify(obj, replacer, spaces);
    if (escape && typeof jsonBody === "string") {
      jsonBody = jsonBody.replace(/[<>&]/g, function (c) {
        switch (c.charCodeAt(0)) {
          case 0x3c:
            return "\\u003c"
          case 0x3e:
            return "\\u003e"
          case 0x26:
            return "\\u0026"
          /* istanbul ignore next: unreachable default */
          default:
            return c
        }
      });
    }
    return this.send(jsonBody);
  }

  /**
   * Send YAML response.
   *
   * Examples:
   *
   *     res.yaml(null);
   *     res.yaml({ user: 'tj' });
   */
  yaml(obj: any) {
    if (!(obj && typeof obj === "object")) throw new TypeError("Require body object");
    else if (!(this.has("Content-Type"))) this.set("Content-Type", "application/x-yaml; text/yaml")
    return this.send(yaml.stringify(obj, null, 2));
  }

  /**
   * Set Link header field with the given `links`.
   *
   * Examples:
   *
   *    res.links({
   *      next: 'http://api.example.com/users?page=2',
   *      last: 'http://api.example.com/users?page=5'
   *    });
   *
   * @param links
   * @public
   */
  links(links: Record<string, string>) {
    let link = this.get("Link") || "";
    if (link) link += ", ";
    return this.set("Link", link + Object.keys(links).map((rel) => "<" + links[rel] + ">; rel=\"' + rel + '\"").join(", "));
  }

  /**
   * Send a response.
   *
   * Examples:
   *
   *     res.send(Buffer.from('wahoo'));
   *     res.send({ some: 'json' });
   *     res.send('<p>some html</p>');
   */
  send(body: any): this {
    if (body === undefined) throw new TypeError("Require body");
    else if (body === null) body = "";
    let encoding: BufferEncoding = "utf8";
    const bodyType = typeof body;
    if (bodyType === "string") {
      if (!(this.has("Content-Type"))) this.set("Content-Type", "text/plain");
    } else if (bodyType === "boolean" || bodyType === "number" || bodyType === "object") {
      if (Buffer.isBuffer(body)) {
        encoding = "binary";
        if (!(this.has("Content-Type"))) this.set("Content-Type", "application/octet-stream");
      } else {
        return this.json(body);
      }
    }

    // strip irrelevant headers
    if (204 === this.statusCode || 304 === this.statusCode) {
      this.removeHeader("Content-Type");
      this.removeHeader("Content-Length");
      this.removeHeader("Transfer-Encoding");
      body = "";
      encoding = "utf8";
    }

    // alter headers for 205
    if (this.statusCode === 205) {
      this.set("Content-Length", "0")
      this.removeHeader("Transfer-Encoding")
      body = ""
      encoding = "utf8";
    }

    if (this.req.Cookies.sizeDiff > 0) this.set("Cookie", this.req.Cookies.toString());

    // skip body for HEAD
    if (this.req.method === "HEAD") this.end();
    else if (body instanceof stream.Readable) body.pipe(this);
    else this.end(body, encoding);

    return this;
  }

  /**
   * Redirect to the given `url` with optional response `status`
   * defaulting to 302.
   *
   * The resulting `url` is determined by `res.location()`, so
   * it will play nicely with mounted apps, relative paths,
   * `"back"` etc.
   *
   * Examples:
   *
   *    res.redirect('/foo/bar');
   *    res.redirect('http://example.com');
   *    res.redirect(new URL('/test', 'http://example.com'));
   *    res.status(301).redirect('http://example.com');
   *    res.redirect('../login'); // /blog/post/1 -> /blog/login
   */
  redirect(url: string|URL): void {
    if (url instanceof URL) url = url.toString();
    this.status(302).set("Location", url);
    this.send(`<p>Redirecting to <a href="${url}">${url}</a></p>`);
  }
};

export interface WsResponse extends WebSocket {
  app: Router;
}

export class WsResponse {
  join(room: string) {
    if (!(this.app.wsRooms.has(room))) this.app.wsRooms.set(room, []);
    this.app.wsRooms.get(room).push(this);
    this.once("close", () => this.app.wsRooms.set(room, this.app.wsRooms.get(room).filter(s => s !== this)));
    return this;
  }

  left(room: string) {
    if (!(this.app.wsRooms.has(room))) throw new TypeError("Room no exists in current Router!");
    this.app.wsRooms.set(room, this.app.wsRooms.get(room).filter(s => s !== this));
    return this;
  }
};

export interface NextFunction {
  /**
   * Call for any error's
   */
  (err?: any): void;
  /**
   * "Break-out" of a router by calling {next('router')};
   */
  (deferToNext: "router"): void;
  /**
   * "Break-out" of a route by calling {next("route")};
   */
  (deferToNext: "route"): void;
}

export type WsRequestHandler = (req: Request, res: WsResponse, next: NextFunction) => void;
export type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;
export type ErrorRequestHandler = (err: any, req: Request, res: Response, next: NextFunction) => void;
export type Handlers = WsRequestHandler|RequestHandler|ErrorRequestHandler;

export class Layer {
  method?: string;
  isRoute?: boolean;
  handler: Handlers;
  matchFunc: MatchFunction;
  match(path: string): undefined|{ path: string, params: Record<string, string> } {
    const value = this.matchFunc(path);
    if (!value) return undefined;
    return {
      path: this.isRoute ? (value.path !== path ? posix.join("/", path.slice(value.path.length)) : value.path) : value.path,
      params: value.params as any,
    };
  }

  constructor(path: string|RegExp, fn: Handlers, options?: Omit<ParseOptions & TokensToRegexpOptions & RegexpToFunctionOptions & { isRoute?: boolean }, "decode"|"encode">) {
    if (!(typeof fn === "function")) throw new Error("Register function");
    if (!(options)) options = {};
    if (path === "*") path = "(.*)";
    this.isRoute = !!options.isRoute;
    this.handler = fn;
    this.matchFunc = regexMatch(path, {...options, decode: decodeURIComponent, encode: encodeURI });
  }
}

export function assignRequest(app: Router, req: IncomingMessage, method: string, params: Record<string, string>): Request {
  const parseQuery = new URLSearchParams(parse(req.url).query);
  mixin(req, Request.prototype, false);
  mixin(req, { app, params }, true);
  defineProperties(req, {
    method: { writable: true, configurable: true, enumerable: true, value: method },
    Cookies: { writable: true, configurable: true, enumerable: true, value: new CookieManeger((req.headers||{}).cookie||"") },
    query: { writable: true, configurable: true, enumerable: true, value: Object.assign(Array.from(parseQuery.keys()).reduce<Record<string, string>>((acc, key) => { acc[key] = parseQuery.get(key); return acc; }, {}), req["query"]) },
    protocol: {
      configurable: true,
      enumerable: true,
      get() {
        const proto = (this.socket || this.connection)["encrypted"] ? "https" : "http";
        // Note: X-Forwarded-Proto is normally only ever a single value, but this is to be safe.
        const header = this.get('X-Forwarded-Proto') || proto;
        const index = header.indexOf(',')
        return index !== -1 ? header.substring(0, index).trim() : header.trim()
      }
    },
    secure: {
      configurable: true,
      enumerable: true,
      get() {
        return this.protocol === "https" || this.protocol === "wss";
      }
    },
    hostname: {
      configurable: true,
      enumerable: true,
      get() {
        let host: string = this.get("X-Forwarded-Host") || this.get("Host");
        if (host.indexOf(",") !== -1) {
          // Note: X-Forwarded-Host is normally only ever a single value, but this is to be safe.
          host = host.substring(0, host.indexOf(",")).trim();
        }
        if (!host) return undefined;

        // IPv6 literal support
        const offset = host[0] === "[" ? host.indexOf("]") + 1 : 0;
        const index = host.indexOf(":", offset);

        return index !== -1 ? host.substring(0, index) : host;
      }
    },
    subdomains: {
      configurable: true,
      enumerable: true,
      get() {
        const hostname: string = this.hostname;
        if (!hostname) return [];
        let offset = 1;
        const subdomains = !isIP(hostname) ? hostname.split(".").reverse() : [hostname];
        if (isIP(hostname)) offset = 0;
        return subdomains.slice(offset);
      }
    },
    ip: {
      configurable: true,
      enumerable: true,
      get() {
        return req.socket.remoteAddress;
      }
    },
    reqPath: {
      configurable: true,
      enumerable: true,
      get() {
        return parse(this.url).pathname;
      }
    },
  });
  return req as any;
}

export function assignResponse(app: Router, res: ServerResponse): Response {
  mixin(res, Response.prototype, false);
  mixin(res, { app }, true);
  return res as any;
}

export function assignWsResponse(app: Router, res: WebSocket): WsResponse {
  mixin(res, WsResponse.prototype, false);
  mixin(res, { app }, true);
  return res as any;
}