import { isIPv4 } from "node:net";
import http2 from "node:http2";
import http from "node:http";
import path from "node:path";
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

  /** Request Protocol */
  protocol: "http"|"https"|"http2";

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

export type errorHandler = (error: Error|TypeError, req: Request, res: Response, next: (err?: any) => void) => void|Promise<void>;
export type handler = (this: Neste, req: Request, res?: Response, next?: (err?: any) => void) => void|Promise<void>;

export class Neste {
  public jsonSpaces = 2;
  #registerRoute(method: string, requestPath: string, ...fn: handler[]) {
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

  /**
   * Create handler for all methods
   */
  all(path: string, ...handlers: handler[]) {
    this.#registerRoute("ALL", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  get(path: string, ...handlers: handler[]) {
    this.#registerRoute("GET", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  post(path: string, ...handlers: handler[]) {
    this.#registerRoute("POST", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  put(path: string, ...handlers: handler[]) {
    this.#registerRoute("PUT", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  delete(path: string, ...handlers: handler[]) {
    this.#registerRoute("DELETE", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  patch(path: string, ...handlers: handler[]) {
    this.#registerRoute("PATCH", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  options(path: string, ...handlers: handler[]) {
    this.#registerRoute("OPTIONS", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  head(path: string, ...handlers: handler[]) {
    this.#registerRoute("HEAD", path, ...handlers);
    return this;
  }

  route(path: string) {
    const self = this;
    const d = {
      /**
       * Create handler for all methods
       */
      all(...handlers: handler[]) {
        self.#registerRoute("ALL", path, ...handlers);
        return d;
      },

      /**
       *
       * @param path - endoint path, example: "/google"
       * @param handlers - callbacks to request
       */
      get(...handlers: handler[]) {
        self.#registerRoute("GET", path, ...handlers);
        return d;
      },

      /**
       *
       * @param path - endoint path, example: "/google"
       * @param handlers - callbacks to request
       */
      post(...handlers: handler[]) {
        self.#registerRoute("POST", path, ...handlers);
        return d;
      },

      /**
       *
       * @param path - endoint path, example: "/google"
       * @param handlers - callbacks to request
       */
      put(...handlers: handler[]) {
        self.#registerRoute("PUT", path, ...handlers);
        return d;
      },

      /**
       *
       * @param path - endoint path, example: "/google"
       * @param handlers - callbacks to request
       */
      delete(...handlers: handler[]) {
        self.#registerRoute("DELETE", path, ...handlers);
        return d;
      },

      /**
       *
       * @param path - endoint path, example: "/google"
       * @param handlers - callbacks to request
       */
      patch(...handlers: handler[]) {
        self.#registerRoute("PATCH", path, ...handlers);
        return d;
      },

      /**
       *
       * @param path - endoint path, example: "/google"
       * @param handlers - callbacks to request
       */
      options(...handlers: handler[]) {
        self.#registerRoute("OPTIONS", path, ...handlers);
        return d;
      },

      /**
       *
       * @param path - endoint path, example: "/google"
       * @param handlers - callbacks to request
       */
      head(...handlers: handler[]) {
        self.#registerRoute("HEAD", path, ...handlers);
        return d;
      },
    };
    return d;
  }

  /**
   * Extends with middlerares or second instace from server
   */
  use(...middle: (Neste|handler|errorHandler)[]): this;

  /**
   * Extends with middlerares or second instace from server
   */
  use(path: string, ...middle: (Neste|handler|errorHandler)[]): this;

  /**
   * Extends with middlerares or second instace from server
   */
  use(hpath: string|(Neste|handler|errorHandler), ...middle: (Neste|handler|errorHandler)[]): this {
    let pathRoot: string;
    const gMiddle: (Neste|handler|errorHandler)[] = [];
    if (typeof hpath === "string") pathRoot = hpath;
    else gMiddle.push(hpath);
    gMiddle.push(...middle);
    this.route_registred.push({
      is: "middle",
      ...(pathRoot ? {
        path: path.posix.resolve("/", pathRoot),
      } : {}),
      middle: gMiddle.filter(k => k instanceof Neste || (typeof k === "function" && (k.length >= 1 && k.length <= 4))),
    })
    return this;
  }

  route_registred: ({
    is: "middle",
    path?: string,
    middle: (Neste|handler|errorHandler)[]
  } | {
    is: "route",
    method: string,
    path: string
    fn: handler[]
  })[] = [];

  async callRequest(rawRequest: http.IncomingMessage|http2.Http2ServerRequest|Request, rawResponse: http.ServerResponse|http2.Http2ServerResponse|Response) {
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

    req.port = (req.connection?.remotePort || req.socket?.remotePort);
    req.ip = (req.connection?.remoteAddress || req.socket?.remoteAddress);
    if (!req.ip) {
      const connectionHead = req.headers["X-Client-IP"] || req.headers["X-Forwarded-For"] || req.headers["CF-Connecting-IP"] || req.headers["Fastly-Client-Ip"] || req.headers["True-Client-Ip"] || req.headers["X-Real-IP"] || req.headers["X-Cluster-Client-IP"] || req.headers["X-Forwarded"] || req.headers["Forwarded-For"] || req.headers["Forwarded"];
      if (connectionHead) {
        if (Array.isArray(connectionHead)) req.ip = req.ip = String(connectionHead.at(-1));
        else req.ip = req.ip = String(connectionHead);
      } else req.ip = ""
    }

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

    const reqPathSplit = String(req.path).split("/");
    const routes = (await Promise.all(this.route_registred.map(async route => {
      const ret: {params: {[name: string]: string}, route: typeof route} = {params: {}, route};
      if (!((route.is === "middle") || (route.method === req.method || route.method === "ALL"))) return null;
      // return if middle and not include path
      if (route.is === "middle") if (!route.path) return ret;
      const splitedRegistredPath = route.path.split("/");
      for (const kIndex in reqPathSplit) {
        if (splitedRegistredPath[kIndex] === undefined) {
          if (route.is === "middle") break;
          return null;
        } else if (splitedRegistredPath[kIndex].startsWith(":")) ret.params[splitedRegistredPath[kIndex].slice(1).trim()] = reqPathSplit[kIndex];
        else if (splitedRegistredPath[kIndex] === "*") break;
        else if (splitedRegistredPath[kIndex] !== reqPathSplit[kIndex]) return null;
      }
      return ret;
    }))).filter(Boolean);

    let page404: handler;
    if (req["allow404"]) page404 = this.route_registred.reduceRight((acc, r) => {
      if (acc) return acc;
      if (r instanceof Neste) return acc;
      else if (r.is === "middle") return acc;
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
    };

    if (routes.length === 0) {
      if (page404) return page404.call(this, req, res, () => {});
      return;
    }

    // create handler
    const errHandler: errorHandler = this.route_registred.reduce((acc, r) => {
      if (acc) return acc;
      if (r instanceof Neste) return acc;
      else if (r.is === "route") return acc;
      const find = r.middle.find(k => k instanceof Neste ? false : k.length >= 4);
      if (find) return find;
      return acc;
    }, null) as errorHandler ?? function (err, req, res, next) {
      return res.status(500).json({
        error: String(err?.message || err),
        stack: err?.stack,
        cause: err?.cause
      });
    };

    const backupParms: typeof req.params = Object(req.params);
    const backupPath = String(req.path);
    let indexRoute = 0;
    let callIndex = 0;
    const next = async (err?: any) => {
      if (res.closed) return;
      if (err) return Promise.resolve(errHandler(err, req, res, (kill?: any) => {}));
      const r = routes[indexRoute];
      if (!r) {
        if (page404) return page404.call(this, req, res, () => {});
        return;
      }
      req.params = {...backupParms, ...r.params};
      req.path = backupPath;
      if (r.route.is === "middle") if (r.route.path) req.path = path.posix.resolve("/", req.path.split("/").slice(r.route.path.split("/").length).join("/"));
      const call: Neste | handler = (r.route.is === "middle" ? r.route.middle[callIndex++] : r.route.fn[callIndex++]) as any;
      if (!call) {
        indexRoute++;
        callIndex = 0;
        return next();
      }
      if (call instanceof Neste) {
        req["allow404"] = false;
        await call.callRequest(req, res);
        req["allow404"] = true;
        return next();
      } else if (call.length >= 4) return next();
      Promise.resolve().then(() => call.call(this, req, res, next)).catch(next);
      return;
    }
    return next();
  }
}
