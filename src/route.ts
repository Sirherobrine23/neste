import { isIPv4 } from "node:net";
import http2 from "node:http2";
import path from "node:path/posix";
import http from "node:http";
import yaml from "yaml";

export interface Request extends http.IncomingMessage {
  res: Response;
  response: Response;
  req: this;
  request: this;

  /** Client IP */
  ip?: string;

  /** Client port */
  port?: number

  /** Request body */
  body?: any;

  /**
   * Request path, example: "/example"
   */
  path: string;
  query: {[queryName: string]: string};
  params: {[queryName: string]: string};
}

export interface Response extends http.ServerResponse<Request> {
  /**
   * Send JSON object and return Promise to wait connection close
   */
  json(data: any, replacerFunc?: (this: any, key: string, value: any) => any): Promise<void>;

  /**
   * Send yaml from JSON object and return Promise to wait connection close
   */
  yaml(data: any): Promise<void>;

  /**
   * Send string or Buffer with content-length
   */
  send(data: string|Buffer): this;

  /**
   * Set HTTP Status code
   */
  status(code: number): this;
}

export type errorHandler = (error: Error|TypeError, req: Request, res: Response, next: () => void) => void|Promise<void>|any;
export type handler = (this: Neste, req: Request, res?: Response, next?: (err?: any) => void) => void|Promise<void>|any;

interface Route {
  all(...handler: handler[]): this;
  get(...handler: handler[]): this;
  post(...handler: handler[]): this;
  put(...handler: handler[]): this;
  delete(...handler: handler[]): this;
  patch(...handler: handler[]): this;
  options(...handler: handler[]): this;
  head(...handler: handler[]): this;
}

/** Object includes basics functions and identifications */
export interface Neste {
  /**
   * Call request event
   */
  callRequest(rawRequest: http.IncomingMessage|http2.Http2ServerRequest|Request, rawResponse: http.ServerResponse|http2.Http2ServerResponse|Response): Promise<void>;
  (rawRequest: http.IncomingMessage|http2.Http2ServerRequest|Request, rawResponse: http.ServerResponse|http2.Http2ServerResponse|Response): Promise<void>;

  /** Default JSON space to send */
  jsonSpaces: number;

  /**
   * Extends with middlerares or second instace from server
   */
  use(...middle: (Neste|handler|errorHandler)[]): this;

  /**
   * Extends with middlerares or second instace from server
   */
  use(path: string, ...middle: (Neste|handler|errorHandler)[]): this;

  /**
   * Create handler for all methods
   */
  all(path: string, ...handler: handler[]): this;
  get(path: string, ...handler: handler[]): this;
  post(path: string, ...handler: handler[]): this;
  put(path: string, ...handler: handler[]): this;
  delete(path: string, ...handler: handler[]): this;
  patch(path: string, ...handler: handler[]): this;
  options(path: string, ...handler: handler[]): this;
  head(path: string, ...handler: handler[]): this;

  /** Create route and return listeners */
  route(path: string): Route;
}

export class Neste extends Function implements Neste {
  constructor() {/*Needs fix this in the future if arguments.callee is removed*/ super("return arguments.callee.callRequest.call(arguments.callee, ...(arguments))");}
  route_registred: ({
    is: "middleware",
    path?: string,
    middle: (Neste|handler|errorHandler)[]
  } | {
    is: "route",
    method: string,
    path: string
    fn: handler[]
  })[] = [];

  jsonSpaces = 2;
  callRequest = (rawRequest: Request | http.IncomingMessage | http2.Http2ServerRequest, rawResponse: Response | http.ServerResponse<http.IncomingMessage> | http2.Http2ServerResponse): Promise<void> => {
    // Update Response object
    const res: Response = rawResponse as any;
    res.status ??= (code) => {res.statusCode = code; return res;}
    // patch send
    let lockHead = false;
    res.send ??= (data) => {
      if (!lockHead) {
        res.writeHead(res.statusCode ?? 200, {"content-length": String(Buffer.byteLength(data))});
        res.setHeader = (...args: any) => res;
        lockHead = true;
        res.end(data);
      }
      return res;
    };

    res.yaml ??= async (data) => new Promise<void>((done, reject) => res.on("error", reject).setHeader("content-type", "text/yaml, text/x-yaml").send(yaml.stringify(data)).on("close", () => done()));
    res.json ??= async (data, replacerFunc = null) => new Promise<void>((done, reject) => res.once("error", reject).setHeader("content-type", "application/json").send(JSON.stringify(data, replacerFunc, this.jsonSpaces)).once("close", () => done()));

    const req: Request = rawRequest as any;
    req.params ??= {};
    req.headers ??= {};

    req.port ??= (req.connection?.remotePort || req.socket?.remotePort);
    req.ip ??= (() => {
      let ip = (req.connection?.remoteAddress || req.socket?.remoteAddress);
      if (!ip) {
        const connectionHead = req.headers["X-Client-IP"] || req.headers["X-Forwarded-For"] || req.headers["CF-Connecting-IP"] || req.headers["Fastly-Client-Ip"] || req.headers["True-Client-Ip"] || req.headers["X-Real-IP"] || req.headers["X-Cluster-Client-IP"] || req.headers["X-Forwarded"] || req.headers["Forwarded-For"] || req.headers["Forwarded"];
        if (connectionHead) {
          if (Array.isArray(connectionHead)) ip = String(connectionHead.at(-1));
          else ip = String(connectionHead);
        } else ip = "";
      }
      return ip;
    })()

    let headHost = req.headers.host;
    if (!headHost) {
      const soc = req.socket || req.connection;
      if (isIPv4(req.ip.replace("::ffff:", ""))) headHost = req.ip.replace("::ffff:", "")+":"+soc.localPort;
      else headHost = `[${req.ip}]:${soc.localPort}`;
    }
    req.path ??= (() => {
      if (!req.url) return "/";
      const d = new URL(req.url, "http://"+(headHost || "localhost.com"));
      return path.posix.resolve("/", decodeURIComponent(d.pathname));
    })();

    req.query ??= (() => {
      if (!req.url) return {};
      const d = new URL(req.url, "http://"+(headHost || "localhost.com"));
      return Array.from(d.searchParams.keys()).reduce((acc, key) => {
        acc[key] = d.searchParams.get(key);
        return acc;
      }, {});
    })();

    // Inject Request and Response
    req.res = req.response = res;
    req.request = req.req = req;
    if (req["allow404"] === undefined) req["allow404"] = true;

    const reqPathSplit = req.path.split("/");
    const routes = this.route_registred.map(route => {
      let ret: {params: {[name: string]: string}, route: typeof route} = {params: {}, route};
      if (route.is === "middleware") if (!route.path) return ret;
      if (!((route.is === "middleware") || (route.method === req.method || route.method === "ALL"))) return null;
      const splitedRegistredPath = route.path.split("/");
      for (const kIndex in reqPathSplit) {
        if (splitedRegistredPath[kIndex] === undefined) {
          if (route.is === "middleware") break;
          return null;
        } else if (splitedRegistredPath[kIndex] === "*") break;
        else if (splitedRegistredPath[kIndex].startsWith(":")) ret.params[splitedRegistredPath[kIndex].slice(1).trim()] = reqPathSplit[kIndex];
        else if (splitedRegistredPath[kIndex] !== reqPathSplit[kIndex]) return null;
      }
      return ret;
    });

    const backupParms: typeof req.params = Object(req.params);
    const backupPath = String(req.path);
    let indexRoute = 0;
    let callIndex = 0;
    const next = async (err?: any) => {
      if (res.closed) return;
      if (err) {
        let errHandler: errorHandler;
        if (!(errHandler = this.route_registred.reduce((acc, r) => {if (acc) return acc; else if (r.is === "route") return acc; const find = r.middle.find(k => typeof k !== "function" ? false : k.length >= 4); if (find) return find; return acc;}, null as any) as errorHandler)) {
          errHandler = function (err, req, res, next) {
            console.log(err)
            return res.status(500).json({
              error: String(err?.message || err),
              stack: err?.stack,
              cause: err?.cause
            });
          }
        }
        return Promise.resolve(errHandler.call(this, err, req, res, () => {}));
      }
      const r = routes[indexRoute];
      if (!r) {
        if (r === null) {indexRoute++; callIndex = 0; return next();}
        if (req["allow404"]) return (this.route_registred.reduceRight((acc, r) => {
          if (acc) return acc;
          else if (r.is === "middleware") return acc;
          else if (r.path !== "*") return acc;
          else if (r.method !== "ALL") return acc;
          const find = r.fn.find(fn => fn.length < 4);
          if (find) return find;
          return acc;
        }, null) as handler ?? function (req, res, next) {
          return res.status(404).json({
            error: "Page not exists",
            path: req.path,
            params: req.params
          });
        }).call(this, req, res, next);
        return;
      }
      req.params = {...backupParms, ...r.params};
      req.path = backupPath;
      if (r.route.is === "middleware") if (r.route.path) req.path = path.posix.resolve("/", req.path.split("/").slice(r.route.path.split("/").length).join("/"));
      const call: Neste | handler = (r.route.is === "middleware" ? r.route.middle[callIndex++] : r.route.fn[callIndex++]) as any;
      if (!call) {indexRoute++; callIndex = 0; return next();}
      if (typeof call !== "function") return next();

      // Call middle
      if (call instanceof Neste) return call(Object.assign(req, {allow404: false}), res).then(() => next());

      // ignore error
      if (call.length >= 4) return next();

      // Call func
      return Promise.resolve().then(() => call.call(this, req, res, next)).catch(next);
    }

    // Fist call
    return next();
  }

  #register_route(method: string, requestPath: string, ...fn: handler[]) {
    method = method.toUpperCase();
    const posixFix = (!requestPath) ? "/*" : path.posix.resolve("/", requestPath);
    if (!(this.route_registred[posixFix])) this.route_registred[posixFix] = [];
    this.route_registred.push(({
      is: "route",
      method,
      path: posixFix,
      fn: fn.filter(k => (typeof k === "function" && (k.length >= 1 && k.length <= 4))),
    }));
  }

  all(path: string, ...handler: handler[]) {
    this.#register_route("ALL", path, ...handler);
    return this;
  }

  get(path: string, ...handler: handler[]) {
    this.#register_route("GET", path, ...handler);
    return this;
  }

  post(path: string, ...handler: handler[]) {
    this.#register_route("POST", path, ...handler);
    return this;
  }

  put(path: string, ...handler: handler[]) {
    this.#register_route("PUT", path, ...handler);
    return this;
  }

  delete(path: string, ...handler: handler[]) {
    this.#register_route("DELETE", path, ...handler);
    return this;
  }

  patch(path: string, ...handler: handler[]) {
    this.#register_route("PATCH", path, ...handler);
    return this;
  }

  options(path: string, ...handler: handler[]) {
    this.#register_route("OPTIONS", path, ...handler);
    return this;
  }

  head(path: string, ...handler: handler[]) {
    this.#register_route("HEAD", path, ...handler);
    return this;
  }

  route(path: string): Route {
    const register_route = this.#register_route;
    const d: Route = {
      all(...handlers) {
        register_route("ALL", path, ...handlers);
        return d;
      },
      get(...handlers) {
        register_route("GET", path, ...handlers);
        return d;
      },
      post(...handlers) {
        register_route("POST", path, ...handlers);
        return d;
      },
      put(...handlers) {
        register_route("PUT", path, ...handlers);
        return d;
      },
      delete(...handlers) {
        register_route("DELETE", path, ...handlers);
        return d;
      },
      patch(...handlers) {
        register_route("PATCH", path, ...handlers);
        return d;
      },
      options(...handlers) {
        register_route("OPTIONS", path, ...handlers);
        return d;
      },
      head(...handlers) {
        register_route("HEAD", path, ...handlers);
        return d;
      },
    };
    return d;
  }

  use(hpath: string|(Neste|handler|errorHandler), ...middle: (Neste|handler|errorHandler)[]) {
    let pathRoot: string;
    const gMiddle: (Neste|handler|errorHandler)[] = [];
    if (typeof hpath === "string") pathRoot = hpath;
    else gMiddle.push(hpath);
    gMiddle.push(...middle);
    this.route_registred.push({
      is: "middleware",
      ...(pathRoot ? {
        path: path.posix.resolve("/", pathRoot),
      } : {}),
      middle: gMiddle.filter(k => {
        let ok = (typeof k === "function" && (k.length >= 1 && k.length <= 4))
        if (!ok) ok = k instanceof Neste;
        return ok;
      }),
    })
    return this;
  }
}

export function createRoute() {return new Neste()}