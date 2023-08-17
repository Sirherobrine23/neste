import { MatchFunction, ParseOptions, RegexpToFunctionOptions, TokensToRegexpOptions, match as regexMatch } from "path-to-regexp";
import { WebSocket } from "ws";
import { Request } from "./request";
import { Response } from "./response";


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
  regexp: MatchFunction;
  fast_star?: boolean;
  fast_slash?: boolean;

  constructor(path: string|RegExp, fn: Handler, options?: Omit<ParseOptions & TokensToRegexpOptions & RegexpToFunctionOptions, "decode">) {
    if (!(typeof fn === "function")) throw new Error("Register function");
    if (!(options)) options = {};
    if (path === "*") path = "(.*)";
    this.handle = fn;
    this.regexp = regexMatch(path, {...options, decode: decodeURIComponent });
    this.fast_star = path === "(.*)";
    this.fast_slash = path === "/" && options.end === false;
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

    // fast path non-ending match for / (any path matches)
    if (this.fast_slash) return { path: "", params: {} };

    // fast path for * (everything matche d in a param)
    if (this.fast_star) return { path, params: {"0": decode_param(path)} };
    const value = this.regexp(path);
    if (!value) return undefined;
    return {
      path: value.path,
      params: value.params as any,
    };
  }

  /** @deprecated */
  async handle_request(req: Request, res: Response, next: NextFunction) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    Promise.resolve().then(() => fn.call(fn, req, res, next)).catch(next);
  }

  /** @deprecated */
  async handle_error(err: any, req: Request, res: Response, next: NextFunction) {
    const fn = this.handle;
    if (fn.length !== 4) return next(err);
    Promise.resolve().then(() => fn.call(fn, err, req, res, next)).catch(next);
  }
}