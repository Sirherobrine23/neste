import { Key, TokensToRegexpOptions, pathToRegexp } from "path-to-regexp";
import { ParseOptions } from "querystring";
import { Request } from "./request";
import { Response } from "./response";

const __methods = [ "get", "head", "post", "put", "delete", "connect", "options", "trace" ] as const;
export type Methods = typeof __methods[number];
export const methods: Methods[] = Object.freeze(__methods) as any;

export type RequestHandler = (req: Request, res: Response, next: (err?: any) => void) => void;
export type ErrorRequestHandler = (error: any, req: Request, res: Response, next: (err?: any) => void) => void;
export interface Handler extends RequestHandler, ErrorRequestHandler {};

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
    this.regexp.fast_star = path === "*";
    this.regexp.fast_slash = path === "/" && options.end === false;
  }

  /**
   * Request Method
   */
  method?: string;

  match(path: string): undefined|{ path: string, params: Record<string, string> } {
    let match: string[];
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

    if (path !== null) {
      // fast path non-ending match for / (any path matches)
      if (this.regexp.fast_slash) return { path: "", params: {} };

      // fast path for * (everything matche d in a param)
      if (this.regexp.fast_star) return { path, params: {"0": decode_param(path)} };

      // match the path
      match = this.regexp.exec(path);
    }

    if (!match) return undefined;

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
      }, match.reduce((acc, v, index) => { const val = decode_param(v); if (val !== undefined) acc[String(index)] = v; return acc; }, {})),
    };
  }

  async handle_request(req: Request, res: Response, next: (err?: any) => void) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try {
      await fn.apply(fn, arguments);
    } catch (err) {
      next(err);
    }
  }

  async handle_error(err: any, req: Request, res: Response, next: (err?: any) => void) {
    const fn = this.handle;
    if (fn.length !== 4) return next(err);
    try {
      await fn.apply(fn, arguments);
    } catch (err) {
      next(err);
    }
  }
}