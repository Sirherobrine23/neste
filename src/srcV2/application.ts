import { IncomingMessage, Server, ServerResponse, createServer } from "node:http";
import { EventEmitter } from "node:stream";
import { mixin } from "../utils";
import { Request, req } from "./request";
import { Response, res } from "./response";
import stream from "node:stream";
import ws from "ws";
import { Methods, methods } from "../router/route";

let __RouterHandler = __RouterHandler__.toString(); __RouterHandler = __RouterHandler.slice(__RouterHandler.indexOf("{")+1, -1).trim();
function __RouterHandler__(this: Router, req: IncomingMessage, res: ServerResponse, next: (err?: any) => void): void {
  if (typeof this.handler === "function") return this.handler.apply(this, arguments);
  else if (typeof arguments.callee["handler"] === "function") return arguments.callee["handler"].apply(arguments.callee, arguments);
  throw new Error("Cannot get Router class");
}

export type fnHandler = (req: Request, res: Response, next: (err?: any) => void) => void;
export type fnErrorHandler = (err: any, req: Request, res: Response, next: (err?: any) => void) => void;

export interface Router extends EventEmitter, Record<Methods, (path: string|RegExp, ...fn: fnHandler[]) => Router> {
  (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void): void;
}

export class Router extends Function {
  #ws = new ws.WebSocketServer({ noServer: true });
  #req: Request = req;
  #res: Response = res;
  constructor() {
    super(__RouterHandler);
    mixin(this, EventEmitter.prototype, false);
  }

  stacks: any[];

  /**
   *
   * @param req - Request socket from http, https server
   * @param res - Response socket from http, https server
   * @param next - Handler request
   */
  handler(req: IncomingMessage, res: ServerResponse, next?: (err?: any) => void): void {
    if (!(this instanceof Router)) throw new Error("Cannot access class");
    mixin(req, this.#req, false);
    mixin(res, this.#res, false);
  }

  handler_upgrade(ws: ws.WebSocket, request: IncomingMessage): void;
  handler_upgrade(req: IncomingMessage, socket: stream.Duplex, head: Buffer): void;
  handler_upgrade(): void {
    if (!(this instanceof Router)) throw new Error("Cannot access class");
    else if (arguments.length === 3) {
      this.#ws.handleUpgrade(arguments[0], arguments[1], arguments[2], (ws, request) => {
        this.#ws.emit("connection", ws, request);
        this.handler_upgrade(ws, request);
      });
      return;
    }
    const ws: ws.WebSocket = arguments[0], request: IncomingMessage = arguments[1];
    this.handler_upgrade(ws, request);
    return;
  }

  use(...fn: (fnErrorHandler|fnHandler)[]): this;
  use(path: string|RegExp, ...fn: (fnErrorHandler|fnHandler)[]): this;
  use() {
    if (typeof arguments[0] === "string" || arguments[0] instanceof RegExp) {
    } else {
    }
    return this;
  };
};

methods.forEach(method => {
  Router.prototype[method] = function() {
    return this;
  }
});

export interface Neste { listen: Server["listen"] };
export class Neste extends Router {}
Neste.prototype.listen = function (this: Neste) {
  const server = createServer();
  server.on("request", this).on("upgrade", this.handler_upgrade.bind(this));
  return server.listen.apply(server, arguments);
}