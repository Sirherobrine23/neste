import { IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo, ListenOptions } from "net";
import { parse } from "url";
import util from "util";
import { WebSocket, WebSocketServer } from "ws";
import { ErrorRequestHandler, Handlers, Layer, NextFunction, RequestHandler, WsRequestHandler, assignRequest, assignResponse, assignWsResponse } from "./handler.js";
import { Methods, methods } from "./util.js";

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

export class Router extends Function {
  constructor(opts?: any) {
    super("if (typeof this.handler === 'function') { this.handler.apply(this, arguments); } else if (typeof arguments.callee === 'function') { arguments.callee.apply(arguments.callee, arguments); } else { throw new Error('Cannot get Router class'); }");
  }

  layers: Layer[] = [];
  wsRooms: Map<string, WsRequestHandler[]> = new Map();

  handler(req: IncomingMessage, res: WebSocket|ServerResponse, next?: NextFunction) {
    if (typeof next !== "function") next = (err) => {
      if (err && !(err === "router" || err === "route")) console.error(err);
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

    if (!req["path"]) req["path"] = (parse(req.url)).pathname;
    const { layers } = this, method = (res instanceof WebSocket ? "ws" : (String(req.method||"").toLowerCase())), saveParms = Object.freeze(req["params"] || {}), originalPath = req["path"];;
    let layersIndex = 0;

    nextHandler().catch(next);
    async function nextHandler(err?: any) {
      req["path"] = originalPath;
      req["params"] = Object.assign({}, saveParms);
      if (err && err === "route") return next();
      else if (err && err === "router") return next(err);
      const layer = layers.at(layersIndex++);
      if (!layer) return next(err);
      else if (layer.method && layer.method !== method) return nextHandler(err);
      const layerMatch = layer.match(req["path"]);
      if (!layerMatch) return nextHandler(err);
      if (err && layer.handler.length !== 4) return nextHandler(err);
      try {
        if (err) {
          if (res instanceof WebSocket) return nextHandler(err);
          const fn = layer.handler as ErrorRequestHandler;
          await fn(err, assignRequest(req, method, Object.assign({}, saveParms, layerMatch.params)), assignResponse(res), nextHandler);
        } else {
          if (res instanceof WebSocket) {
            const fn = layer.handler as WsRequestHandler;
            await fn(assignRequest(req, method, Object.assign({}, saveParms, layerMatch.params)), assignWsResponse(res, this), nextHandler);
          } else {
            const fn = layer.handler as RequestHandler;
            await fn(assignRequest(req, method, Object.assign({}, saveParms, layerMatch.params)), assignResponse(res), nextHandler);
          }
        }
      } catch (err) {
        nextHandler(err);
      }
    }
  }


  use(...fn: Handlers[]): this;
  use(path: string|RegExp, ...fn: Handlers[]): this;
  use() {
    let p: [string|RegExp, Handlers[]];
    if (!(arguments[0] instanceof RegExp || typeof arguments[0] === "string" && arguments[0].trim())) p = ["/", Array.from(arguments)];
    else p = [arguments[0], Array.from(arguments).slice(1)];
    for (const fn of p[1]) {
      if (typeof fn !== "function") throw new Error(util.format("Invalid middleare, require function, recived %s", typeof fn));
      this.layers.push(new Layer(p[0], fn, { strict: false, end: false }));
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
  httpServer: Server;
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
    })()).address()
  }

  closeAllConnections(): void {
    (this.httpServer||(() => {
      this.httpServer = new Server(this);
      const wsServer = new WebSocketServer({ noServer: true });
      this.httpServer.on("upgrade", (req, sock, head) => wsServer.handleUpgrade(req, sock, head, (client) => this.handler(req, client)));
      return this.httpServer;
    })()).closeAllConnections()
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

const app = new Neste();
app.listen(3000, () => console.log("Http 3000"))
app.get("/", ({headers, Cookies, hostname}, res) => res.json({ req: { headers, Cookies: Cookies.toJSON(), hostname } }))