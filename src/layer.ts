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
  params: Record<string, any>;
  keys: Key[];
  path: string;

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

  match(path: string) {
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
    if (path != null) {
      // fast path non-ending match for / (any path matches)
      if (this.regexp.fast_slash) {
        this.params = {}
        this.path = ''
        return true
      }

      // fast path for * (everything matched in a param)
      if (this.regexp.fast_star) {
        this.params = {'0': decode_param(path)};
        this.path = path;
        return true;
      }

      // match the path
      match = this.regexp.exec(path);
    }

    if (!match) {
      this.params = undefined;
      this.path = undefined;
      return false;
    }

    // store values
    this.params = {};
    this.path = match[0]

    let keys = this.keys;
    let params = this.params;

    for (let i = 1; i < match.length; i++) {
      let key = keys[i - 1];
      let prop = key.name;
      let val = decode_param(match[i])

      if (val !== undefined || !(Object.hasOwnProperty.call(params, prop))) {
        params[prop] = val;
      }
    }

    return true;
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