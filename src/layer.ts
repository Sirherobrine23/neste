import { Key, TokensToRegexpOptions, pathToRegexp } from "path-to-regexp";
import { ParseOptions } from "querystring";
import { Request } from "./request";
import { Response } from "./response";
import { WebSocket } from "ws";


export interface NextFunction {
  /**
   * Call for any error's
   */
  (err?: any): void;
  /**
   * "Break-out" of a router by calling {next('router')};
   */
  (deferToNext: 'router'): void;
  /**
   * "Break-out" of a route by calling {next('route')};
   */
  (deferToNext: 'route'): void;
}
export type ErrorRequestHandler = (error: any, req: Request, res: Response, next: NextFunction) => void;
export type WsRequestHandler = (req: Request, socket: WebSocket, next: NextFunction) => void;
export type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;
export type Handler = RequestHandler|ErrorRequestHandler|WsRequestHandler;

export class Layer {
  handle: Handler;
  regexp: RegExp & { fast_star?: boolean; fast_slash?: boolean };
  keys: Key[];

  constructor(path: string|RegExp, fn: Handler, options?: TokensToRegexpOptions & ParseOptions) {
    if (!(typeof fn === "function")) throw new Error("Register function");
    if (!(options)) options = {};
    if (path === "*") path = "(.*)";
    this.handle = fn;
    this.regexp = pathToRegexp(path, (this.keys = []), options);
    this.regexp.fast_star = path === "(.*)";
    this.regexp.fast_slash = path === "/" && options.end === false;
  }

  /**
   * Request Method
   */
  method?: string;

  match(path: string): undefined|{ path: string, params: Record<string, string> } {
    const decode_param = (val) => {
      if (typeof val !== 'string' || val.length === 0) return val;
      try {
        return decodeURIComponent(val);
      } catch (err) {
        if (err instanceof URIError) {
          err.message = 'Failed to decode param \'' + val + '\'';
          err["status"] = err["statusCode"] = 400;
        }
        throw err;
      }
    }

    // match the path
    let match: string[] = this.regexp.exec(path);
    if (!match) {
      // fast path non-ending match for / (any path matches)
      if (this.regexp.fast_slash) return { path: "", params: {} };

      // fast path for * (everything matche d in a param)
      if (this.regexp.fast_star) return { path, params: {"0": decode_param(path)} };
      return undefined;
    }

    // store values
    const __path = match[0], keys = this.keys;
    match = Array.from(match).slice(1);
    return {
      path: __path,
      params: keys.reduce((acc, key, i) => {
        const prop = key.name;
        const val = decode_param(match[i]);
        if (!(val === undefined || Object.hasOwnProperty.call(acc, prop))) acc[prop] = val;
        return acc;
      }, match.reduce((acc, v, index) => {
        if (!!v) {
          const val = decode_param(v);
          acc[String(index)] = val;
        }
        return acc;
      }, {})),
    };
  }

  async handle_request(req: Request, res: Response, next: NextFunction) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try {
      await fn.apply(fn, arguments);
    } catch (err) {
      next(err);
    }
  }

  async handle_error(err: any, req: Request, res: Response, next: NextFunction) {
    const fn = this.handle;
    if (fn.length !== 4) return next(err);
    try {
      await fn.apply(fn, arguments);
    } catch (err) {
      next(err);
    }
  }
}