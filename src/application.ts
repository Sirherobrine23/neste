import cookie from "cookie";
import { EventEmitter } from "events";
import finalhandler from "finalhandler";
import { IncomingMessage, Server, ServerResponse, createServer } from "http";
import { isIPv6 } from "net";
import { resolve as pathResolve } from "path/posix";
import { parse } from "url";
import nodeUtil from "util";
import { ErrorRequestHandler, Handler, Layer, RequestHandler } from "./layer";
import { Request, req as __req } from "./request";
import { Response, res as __res } from "./response";
import { compileQueryParser, compileTrust, methods, mixin, setPrototypeOf } from "./utils";

export type { Handler };

const trustProxyDefaultSymbol = '@@symbol:trust_proxy_default';

let __RouterHandler = __RouterHandler__.toString(); __RouterHandler = __RouterHandler.slice(__RouterHandler.indexOf("{")+1, -1).trim();
function __RouterHandler__(this: Router, req: IncomingMessage, res: ServerResponse, next: (err?: any) => void): void {
  if (typeof this.handler === "function") return this.handler.apply(this, arguments);
  else if (typeof arguments.callee["handler"] === "function") return arguments.callee["handler"].apply(arguments.callee, arguments);
  throw new Error("Cannot get Router class");
}

export interface Router {
  (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void): void;
  get(path: string|RegExp, ...fn: RequestHandler[]): this;
  put(path: string|RegExp, ...fn: RequestHandler[]): this;
  head(path: string|RegExp, ...fn: RequestHandler[]): this;
  post(path: string|RegExp, ...fn: RequestHandler[]): this;
  trace(path: string|RegExp, ...fn: RequestHandler[]): this;
  delete(path: string|RegExp, ...fn: RequestHandler[]): this;
  connect(path: string|RegExp, ...fn: RequestHandler[]): this;
  options(path: string|RegExp, ...fn: RequestHandler[]): this;
}

export class Router extends Function {
  cache = {};
  settings: Record<string, string> = {};
  locals: Record<any, any> = Object.create(null);
  mountpath = "/";

  request: Request;
  response: Response;

  constructor() {
    super(__RouterHandler);
    mixin(this, EventEmitter.prototype, false);
    const env = process.env.NODE_ENV || "development";
    this.set("env", env);
    this.set("query parser", "extended");
    this.set("subdomain offset", 2);
    this.set("trust proxy", false);
    this.set("json spaces", 2);

    // trust proxy inherit back-compat
    Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
      configurable: true,
      value: true
    });

    // default locals
    this.locals.settings = this.settings;

    // default configuration
    this.set("jsonp callback name", "callback");

    // expose the prototype that will get set on requests and responses
    this.request = Object.create(__req, {
      app: { configurable: true, enumerable: true, writable: true, value: this }
    });
    this.response = Object.create(__res, {
      app: { configurable: true, enumerable: true, writable: true, value: this }
    });
  }

  stacks: Layer[] = [];

  /**
   *
   * @param req - Request socket from http, https server
   * @param res - Response socket from http, https server
   * @param next - Handler request
   */
  handler(req: IncomingMessage, res: ServerResponse, done?: (err?: any) => void): void {
    if (!(this instanceof Router)) throw new Error("Cannot access class");
    if (done === undefined) done = finalhandler(req, res, { env: this.set("env"), onerror: (err) => { if (this.set("env") !== "test") console.error(err.stack || err.toString()); } });
    if (this.stacks.length === 0) return done();
    const method = req.method = typeof req.method === "string" ? req.method.toLowerCase() : req.method;
    req["res"] = res;
    // @ts-ignore
    res["req"] = req;
    req["next"] = done;
    let { pathname, query } = parse(req.url);
    req["path"] ||= pathResolve(pathname);
    const parseQuery = new URLSearchParams(query);
    const CookiesStorage = new Map<string, string>();
    if (typeof req.headers.cookie === "string") {
      const parsed = cookie.parse(req.headers.cookie);
      Object.keys(parsed).forEach(k => CookiesStorage.set(k, parsed[k]));
    }
    setPrototypeOf(res, Object.create(this.response, {}));
    setPrototypeOf(req, Object.create(this.request, {
      query: { configurable: true, enumerable: true, writable: true, value: Array.from(parseQuery.keys()).reduce<Record<string, string>>((acc, key) => { acc[key] = parseQuery.get(key); return acc; }, {}) },
      ipPort: { configurable: false, enumerable: false, writable: false, value: req.socket.remoteAddress ? (isIPv6(req.socket.remoteAddress) ? `[${req.socket.remoteAddress}]:${req.socket.remotePort}` : `${req.socket.remoteAddress}:${req.socket.remotePort}`) : undefined },
      method: { configurable: false, enumerable: false, writable: false, value: method },
      Cookies: { configurable: true, enumerable: true, writable: true, value: CookiesStorage },
    }));
    res["locals"] = res["locals"] || Object.create(null);

    let stackX = 0;
    const { stacks } = this;
    const saveParms = Object.freeze(req["params"] || {});
    const originalPath = req["path"];

    next();
    function next(err?: any) {
      req["path"] = originalPath;
      if (err && err === "route") return done();
      else if (err && err === "router") return done(err);
      const layer = stacks[stackX++];
      if (!layer) return done(err);
      else if (layer.method && layer.method !== method) return next(err);
      const layerMatch = layer.match(req["path"]);
      if (!layerMatch) return next(err);
      req["params"] = Object.assign({}, saveParms, layerMatch.params);
      req["path"] = req["path"].slice(layerMatch.path.length) || layer.method && layerMatch.path || "/";

      if (err) layer.handle_error(err, req as any, res as any, next)
      else layer.handle_request(req as any, res as any, next);
    }
  }

  use(...fn: RequestHandler[]): this;
  use(path: string|RegExp, ...fn: RequestHandler[]): this;
  use(...fn: ErrorRequestHandler[]): this;
  use(path: string|RegExp, ...fn: ErrorRequestHandler[]): this;
  use() {
    const Args = Array.from(arguments);
    let path: any = "/", offset = 0;
    if (typeof Args[0] === "string" || Args[0] instanceof RegExp) {
      path = Args[0];
      offset = 1;
    }

    for (; offset < Args.length;) {
      const fn = Args[offset++];
      if (typeof fn !== "function") throw new Error(nodeUtil.format("Invalid middleare, require function, recived %s", typeof fn));
      const layerFN = new Layer(path, fn, {
        strict: false,
        end: false,
      });
      this.stacks.push(layerFN);
    }
    return this;
  };

  all(path: string|RegExp, ...fn: RequestHandler[]): this ;
  all() {
    if (!(arguments[0] instanceof RegExp || (typeof arguments[0] === "string" && arguments[0].length > 0))) throw new Error("Require path");
    this.use.apply(this, arguments);
    return this;
  }

  set(setting: string): any;
  set(setting: string, val: any): this;
  set(setting: string, val?: any) {
    if (arguments.length === 1) {
      let settings = this.settings
      while (settings && settings !== Object.prototype) {
        if (Object.hasOwnProperty.call(settings, setting)) return settings[setting];
        settings = Object.getPrototypeOf(settings);
      }

      return undefined;
    }

    // set value
    this.settings[setting] = val;

    // trigger matched settings
    switch (setting) {
      case 'query parser':
        this.set('query parser fn', compileQueryParser(val));
        break;
      case 'trust proxy':
        this.set('trust proxy fn', compileTrust(val));
        // trust proxy inherit back-compat
        Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
          configurable: true,
          value: false
        });
        break;
    }

    return this;
  };

  enabled(setting: string) {
    return Boolean(this.set(setting));
  }

  enable(setting: string) {
    return this.set(setting, true);
  }

  disabled(setting: string) {
    return !(this.set(setting));
  }

  disable(setting: string) {
    return this.set(setting, false);
  }

  path() {
    return this["parent"] ? this["parent"].path() + this.mountpath : "";
  }
};

methods.forEach(method => {
  Router.prototype[method] = function() {
    const [ path, ...fn ] = Array.from(arguments);
    if (!(path instanceof RegExp || (typeof path === "string" && path.length > 0))) throw new Error("Require path");
    for (const _fn of fn) {
      const layerFN = new Layer(path, _fn, {});
      layerFN.method = method;
      this.stacks.push(layerFN);
    }
    return this;
  }
});

export interface Neste { listen: Server["listen"] };
export class Neste extends Router {
}

Neste.prototype.listen = function (this: Neste) {
  const server = createServer();
  server.on("request", this.handler.bind(this));
  return server.listen.apply(server, arguments);
}