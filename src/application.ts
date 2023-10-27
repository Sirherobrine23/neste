import { IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo, ListenOptions } from "net";
import path from "path";
import { parse } from "url";
import util from "util";
import { WebSocket, WebSocketServer } from "ws";
import { ErrorRequestHandler, Handlers, Layer, NextFunction, RequestHandler, WsRequestHandler, WsResponse, assignRequest, assignResponse, assignWsResponse } from "./handler.js";
import { Methods, methods } from "./util.js";

export type RouterSettingsConfig = Record<string, any>;
export class RouterSettings extends Map<string, any> {
  constructor(sets?: RouterSettingsConfig) {
    super();
    if (sets) for (const k in sets) this.set(k, sets[k]);
  }
  toJSON(): RouterSettingsConfig {
    return Array.from(this.entries()).reduce((acc, [key, value]) => Object.assign(acc, {[key]: value}), {});
  }
}

export interface Router {
  (req: IncomingMessage, res: ServerResponse, next?: (err?: any) => void): void;
  (req: IncomingMessage, socket: WebSocket, next?: (err?: any) => void): void;
  ws(path: string|RegExp, ...fn: WsRequestHandler[]): this;
  get(path: string|RegExp, ...fn: RequestHandler[]): this;
  put(path: string|RegExp, ...fn: RequestHandler[]): this;
  head(path: string|RegExp, ...fn: RequestHandler[]): this;
  post(path: string|RegExp, ...fn: RequestHandler[]): this;
  trace(path: string|RegExp, ...fn: RequestHandler[]): this;
  delete(path: string|RegExp, ...fn: RequestHandler[]): this;
  connect(path: string|RegExp, ...fn: RequestHandler[]): this;
  options(path: string|RegExp, ...fn: RequestHandler[]): this;
}

export class WsRoom extends Map<string, WsResponse[]> {
  /**
   * Send data to all connections
   * @param room - room name
   * @param data - Data
   */
  async send(room: string, data: string|Buffer|ArrayBuffer) {
    if (!(super.has(room))) return;
    await Promise.all(super.get(room).filter(s => !(s.CLOSED||s.CLOSING)).map(s => new Promise<void>((done, reject) => s.send(data, err => err ? reject(err) : done()))));
  }

  /**
   * Close connections and delete room
   * @param room - room name
   */
  close(room: string, code?: number) {
    if (!(super.has(room))) return;
    super.get(room).forEach(s => s.close(code));
    super.delete(room);
  }
}

export class Router extends Function {
  constructor(routeOpts?: RouterSettingsConfig) {
    super("if (typeof this.handler === 'function') { this.handler.apply(this, arguments); } else if (typeof arguments.callee === 'function') { arguments.callee.apply(arguments.callee, arguments); } else { throw new Error('Cannot get Router class'); }");
    this.settings = new RouterSettings(routeOpts);
    this.settings.set("env", process.env.NODE_ENV || "development").set("path resolve", true).set("json space", 2);
    this.settings.set("json replacer", (_key: string, value: any) => {
      if (value instanceof BigInt || typeof value === "bigint") return { type: "bigint", value: value.toString() };
      // else if (!(Array.isArray(value)) && value[Symbol.iterator]) return Array.from(value);
      else if (value && typeof value.toJSON === "function") return value.toJSON();
      return value;
    });
  }

  layers: Layer[] = [];
  settings: RouterSettings;
  wsRooms: WsRoom = new WsRoom();

  handler(req: IncomingMessage, res: WebSocket|ServerResponse, next?: NextFunction) {
    if (typeof next !== "function") next = (err?: any) => {
      if (err && !(err === "router" || err === "route") && this.settings.get("env") !== "production") console.error(err);
      if (res instanceof WebSocket) {
        res.send("Close connection!");
        res.close();
      } else {
        if (err) {
          res.statusCode = 500;
          res.end(err?.stack||err?.message||String(err))
        } else {
          res.statusCode = 404;
          res.end("No path\n");
        }
      }
    }

    const { layers } = this, method = (res instanceof WebSocket ? "ws" : (String(req.method||"").toLowerCase())), saveParms = Object.freeze(req["params"] || {});
    let originalPath: string = req["path"]||(parse(req.url)).pathname;
    if (this.settings.get("path resolve")) originalPath = path.posix.resolve("/", originalPath);
    if (this.settings.has("app path") && typeof this.settings.get("app path") === "string" && originalPath.startsWith(this.settings.get("app path"))) originalPath = path.posix.resolve("/", originalPath.slice(path.posix.resolve("/", this.settings.get("app path")).length));
    let layersIndex = 0;

    const nextHandler = async (err?: any) => {
      req["path"] = originalPath;
      req["params"] = Object.assign({}, saveParms);
      if (err && err === "route") return next();
      else if (err && err === "router") return next(err);
      const layer = layers.at(layersIndex++);
      if (!layer) return next(err);
      else if (layer.method && layer.method !== method) return nextHandler(err);
      const layerMatch = layer.match(req["path"]);
      if (!layerMatch) return nextHandler(err);
      req["path"] = layerMatch.path;
      if (err && layer.handler.length !== 4) return nextHandler(err);
      try {
        if (err) {
          if (res instanceof WebSocket) return nextHandler(err);
          const fn = layer.handler as ErrorRequestHandler;
          await fn(err, assignRequest(this, req, method, Object.assign({}, saveParms, layerMatch.params)), assignResponse(this, res), nextHandler);
        } else {
          if (res instanceof WebSocket) {
            const fn = layer.handler as WsRequestHandler;
            await fn(assignRequest(this, req, method, Object.assign({}, saveParms, layerMatch.params)), assignWsResponse(this, res), nextHandler);
          } else {
            const fn = layer.handler as RequestHandler;
            await fn(assignRequest(this, req, method, Object.assign({}, saveParms, layerMatch.params)), assignResponse(this, res), nextHandler);
          }
        }
      } catch (err) {
        nextHandler(err);
      }
    }
    nextHandler().catch(next);
  }


  use(...fn: RequestHandler[]): this;
  use(path: string|RegExp, ...fn: RequestHandler[]): this;
  use() {
    let p: [string|RegExp, Handlers[]];
    if (!(arguments[0] instanceof RegExp || typeof arguments[0] === "string" && arguments[0].trim())) p = ["(.*)", Array.from(arguments)];
    else p = [arguments[0], Array.from(arguments).slice(1)];
    for (const fn of p[1]) {
      if (typeof fn !== "function") throw new Error(util.format("Invalid middleare, require function, recived %s", typeof fn));
      this.layers.push(new Layer(p[0], fn, { isRoute: true, strict: false, end: false }));
    }
    return this;
  }

  all(path: string|RegExp, ...handlers: RequestHandler[]) {
    if (!(path instanceof RegExp || typeof path === "string" && path.trim())) throw new Error("Set path");
    for (const fn of handlers) {
      const layerHand = new Layer(path, fn);
      this.layers.push(layerHand);
    }
    return this;
  }

  __method(method: Methods, path: string|RegExp, ...handlers: RequestHandler[]) {
    if (!(path instanceof RegExp || typeof path === "string" && path.trim())) throw new Error("Set path");
    for (const fn of handlers) {
      const layerHand = new Layer(path, fn);
      layerHand.method = method;
      this.layers.push(layerHand);
    }
    return this;
  }
};

methods.forEach(method => Router.prototype[method] = function(this: Router) { return this.__method.apply(this, ([method] as any[]).concat(Array.from(arguments))) } as any)

export class Neste extends Router {
  httpServer?: Server;
  listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
  listen(port?: number, hostname?: string, listeningListener?: () => void): this;
  listen(port?: number, backlog?: number, listeningListener?: () => void): this;
  listen(port?: number, listeningListener?: () => void): this;
  listen(path: string, backlog?: number, listeningListener?: () => void): this;
  listen(path: string, listeningListener?: () => void): this;
  listen(options: ListenOptions, listeningListener?: () => void): this;
  listen(handle: any, backlog?: number, listeningListener?: () => void): this;
  listen(handle: any, listeningListener?: () => void): this;
  listen(): this {
    (this.httpServer||(() => {
      this.httpServer = new Server(this);
      const wsServer = new WebSocketServer({ noServer: true });
      this.httpServer.on("upgrade", (req, sock, head) => wsServer.handleUpgrade(req, sock, head, (client) => this.handler(req, client)));
      return this.httpServer;
    })()).listen.apply(this.httpServer, arguments);
    return this;
  }

  getConnections(cb: (error: Error, count: number) => void): void {
    (this.httpServer||(() => {
      this.httpServer = new Server(this);
      const wsServer = new WebSocketServer({ noServer: true });
      this.httpServer.on("upgrade", (req, sock, head) => wsServer.handleUpgrade(req, sock, head, (client) => this.handler(req, client)));
      return this.httpServer;
    })()).getConnections(cb);
  }

  address(): string | AddressInfo {
    return (this.httpServer||(() => {
      this.httpServer = new Server(this);
      const wsServer = new WebSocketServer({ noServer: true });
      this.httpServer.on("upgrade", (req, sock, head) => wsServer.handleUpgrade(req, sock, head, (client) => this.handler(req, client)));
      return this.httpServer;
    })()).address();
  }

  closeAllConnections(): void {
    (this.httpServer||(() => {
      this.httpServer = new Server(this);
      const wsServer = new WebSocketServer({ noServer: true });
      this.httpServer.on("upgrade", (req, sock, head) => wsServer.handleUpgrade(req, sock, head, (client) => this.handler(req, client)));
      return this.httpServer;
    })()).closeAllConnections();
  }

  closeIdleConnections(): void {
    (this.httpServer||(() => {
      this.httpServer = new Server(this);
      const wsServer = new WebSocketServer({ noServer: true });
      this.httpServer.on("upgrade", (req, sock, head) => wsServer.handleUpgrade(req, sock, head, (client) => this.handler(req, client)));
      return this.httpServer;
    })()).closeIdleConnections();
  }

  close(callback?: (err?: Error) => void) {
    (this.httpServer||(() => {
      this.httpServer = new Server(this);
      const wsServer = new WebSocketServer({ noServer: true });
      this.httpServer.on("upgrade", (req, sock, head) => wsServer.handleUpgrade(req, sock, head, (client) => this.handler(req, client)));
      return this.httpServer;
    })()).close(callback);

    return this;
  }

  setTimeout(msecs?: number, callback?: () => void): this;
  setTimeout(callback: () => void): this;
  setTimeout(): this {
    (this.httpServer||(() => {
      this.httpServer = new Server(this);
      const wsServer = new WebSocketServer({ noServer: true });
      this.httpServer.on("upgrade", (req, sock, head) => wsServer.handleUpgrade(req, sock, head, (client) => this.handler(req, client)));
      return this.httpServer;
    })()).setTimeout.apply(this.httpServer, arguments);
    return this;
  }
}