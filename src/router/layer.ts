import { Request } from "../request";
import { Response } from "../response";
import { Key, pathToRegexp } from "path-to-regexp";

/**
 * Decode param value.
 */
function decode_param(val: string): string {
  if (typeof val !== 'string' || val.length === 0) {
    return val;
  }

  try {
    return decodeURIComponent(val);
  } catch (err) {
    if (err instanceof URIError) {
      err.message = "Failed to decode param '" + val + "\'";
      err["status"] = err["statusCode"] = 400;
    }

    throw err;
  }
}

export interface Handlers {
  (req: Request, res: Response, next: (err?: any) => void): void
  (error: any, req: Request, res: Response, next: (err?: any) => void): void
}

export class Layer {
  handle: Handlers;
  regexp: RegExp & { fast_star?: boolean; fast_slash?: boolean };
  name: string;
  path: string;
  params: Record<string, any>;
  keys: Key[];

  constructor(path: string, options: any, fn: Handlers) {
    const opts = options || {};

    this.handle = fn;
    this.name = fn.name || '<anonymous>';
    this.params = undefined;
    this.path = undefined;
    this.regexp = pathToRegexp(path, this.keys = [], opts);

    // set fast path flags
    this.regexp.fast_star = path === '*'
    this.regexp.fast_slash = path === '/' && opts.end === false
  }

  /**
   * Handle method
   * @type {undefined|string}
   */
  method: string|undefined;

  /**
   * Handle the error for the layer.
   *
   * @param {Error} error
   * @param {Request} req
   * @param {Response} res
   * @param {function} next
   * @api private
   */

  async handle_error(error: any, req: Request, res: Response, next: (err?: any) => void) {
    const fn = this.handle;

    if (fn.length !== 4) {
      // not a standard error handler
      return next(error);
    }

    try {
      await fn(error, req, res, next);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Handle the request for the layer.
   */

  async handle_request(req: Request, res: Response, next: (err?: any) => void) {
    const fn = this.handle;

    // not a standard request handler
    if (fn.length > 3) return next();

    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Check if this route matches `path`, if so
   * populate `.params`.
   */
  match(path: string): boolean {
    let match

    if (path != null) {
      // fast path non-ending match for / (any path matches)
      if (this.regexp["fast_slash"]) {
        this.params = {}
        this.path = ''
        return true
      }

      // fast path for * (everything matched in a param)
      if (this.regexp["fast_star"]) {
        this.params = {'0': decode_param(path)}
        this.path = path
        return true
      }

      // match the path
      match = this.regexp.exec(path)
    }

    if (!match) {
      this.params = undefined;
      this.path = undefined;
      return false;
    }

    // store values
    this.params = {};
    this.path = match[0]

    const keys = this.keys;
    const params = this.params;

    for (let i = 1; i < match.length; i++) {
      const key = keys[i - 1];
      const prop = key.name;
      const val = decode_param(match[i])

      if (val !== undefined || !(Object.prototype.hasOwnProperty.call(params, prop))) {
        params[prop] = val;
      }
    }

    return true;
  };
}