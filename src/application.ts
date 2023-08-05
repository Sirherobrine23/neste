import EventEmitter from "events";
import http from "node:http";
import { parse } from "url";
import type { Request } from "./request";
import type { Response } from "./response";
import * as Router from "./router/index";
import { methods } from "./router/route";
import { compileQueryParser, compileTrust, setPrototypeOf } from "./utils";
import finalhandler from "finalhandler";

type PickValue<T> = T extends ReadonlyArray<any> ? { [K in Extract<keyof T, number>]: PickValue<T[K]>; }[number] : T;
type FlatArray<T extends ArrayLike<any>> = Array<PickValue<T[number]>>;
function flatten<T extends any[]>(args: T): FlatArray<T> {
  return Array.from(args).flat(Infinity);
};

const slice = Array.prototype.slice;
const trustProxyDefaultSymbol = '@@symbol:trust_proxy_default';

/**
 * Log error using console.error.
 *
 * @param {Error} err
 * @private
 */

function logerror(err) {
  /* istanbul ignore next */
  if (this.get('env') !== 'test') console.error(err.stack || err.toString());
}

export type fnHandler = (req: Request, res: Response, next: (err?: any) => void) => void;
export type fnErrorHandler = (err: any, req: Request, res: Response, next: (err?: any) => void) => void;

export interface Application extends EventEmitter, Record<(typeof methods[number]), (path: string|RegExp, ...fn: fnHandler[]) => Application> {
  listen: http.Server["listen"];
}

export class Application extends EventEmitter {
  constructor() {
    super();
  }

  cache = {};
  settings = {};
  locals: {[k: string]: any} = {};
  mountpath = "/";
  _router: Router.Router;
  request: any;
  response: any;

  /**
   * Initialize the server.
   *
   *   - setup default configuration
   *   - setup default middleware
   *   - setup route reflection methods
   *
   */

  init() {
    this.cache = {};
    this.settings = {};

    // @ts-ignore
    this.defaultConfiguration();
  };

  /**
   * Initialize application configuration.
   */

  defaultConfiguration() {
    const env = process.env.NODE_ENV || 'development';

    // default settings
    this.set('env', env);
    this.set('query parser', 'extended');
    this.set('subdomain offset', 2);
    this.set('trust proxy', false);

    // trust proxy inherit back-compat
    Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
      configurable: true,
      value: true
    });

    // @ts-ignore
    this.on('mount', function onmount(parent) {
      // inherit trust proxy
      if (this.settings[trustProxyDefaultSymbol] === true
        && typeof parent.settings['trust proxy fn'] === 'function') {
        delete this.settings['trust proxy'];
        delete this.settings['trust proxy fn'];
      }

      // inherit protos
      setPrototypeOf(this.request, parent.request)
      setPrototypeOf(this.response, parent.response)
      setPrototypeOf(this.engines, parent.engines)
      setPrototypeOf(this.settings, parent.settings)
    });

    // setup locals
    this.locals = Object.create(null);

    // top-most app is mounted at /
    this.mountpath = '/';

    // default locals
    this.locals.settings = this.settings;

    // default configuration
    this.set('jsonp callback name', 'callback');

    Object.defineProperty(this, 'router', {
      get: function () {
        throw new Error('\'app.router\' is deprecated!\nPlease see the 3.x to 4.x migration guide for details on how to update your app.');
      }
    });
  };

  /**
   * lazily adds the base router if it has not yet been added.
   *
   * We cannot add the base router in the defaultConfiguration because
   * it reads app settings which might be set after that has run.
   *
   */
  lazyrouter() {
    const app = this;
    if (!this._router) {
      this._router = Router.proto({
        caseSensitive: this.enabled('case sensitive routing'),
        strict: this.enabled('strict routing')
      });

      // @ts-ignore
      this._router.use(function query(req, res, next){
        if (!req.query) req.query = new URLSearchParams(parse(req).query);
        req.res = res;
        res.req = req;
        req.next = next;

        setPrototypeOf(req, app.request)
        setPrototypeOf(res, app.response)

        res.locals = res.locals || Object.create(null);
        next();
      });
    }
  };

  /**
   * Dispatch a req, res pair into the application. Starts pipeline processing.
   *
   * If no callback is provided, then default error handlers will respond
   * in the event of an error bubbling through the stack.
   *
   */

  handle(req, res, callback) {
    const router = this._router;

    // @ts-ignore final handler
    const done = callback || finalhandler(req, res, { env: this.get('env'), onerror: logerror.bind(this) });

    // no routes
    if (!router) {
      done();
      return;
    }

    router.handle(req, res, done);
  };

  /**
   * Proxy `Router#use()` to add middleware to the app router.
   * See Router#use() documentation for details.
   *
   * If the _fn_ parameter is an express app, then it will be
   * mounted at the _route_ specified.
   *
   * @public
   */

  use(fn) {
    let offset = 0;
    let path = '/';

    // default path to '/'
    // disambiguate app.use([fn])
    if (typeof fn !== 'function') {
      let arg = fn;

      while (Array.isArray(arg) && arg.length !== 0) {
        arg = arg[0];
      }

      // first arg is the path
      if (typeof arg !== 'function') {
        offset = 1;
        path = fn;
      }
    }

    const fns = flatten(slice.call(arguments, offset));

    if (fns.length === 0) {
      throw new TypeError('app.use() requires a middleware function')
    }

    // setup router
    this.lazyrouter();
    const router = this._router;

    fns.forEach(function (fn): any {
      // non-express app
      if (!fn || !fn.handle || !fn.set) {
        return router.use(path, fn);
      }

      fn.mountpath = path;
      fn.parent = this;

      // restore .app property on req and res
      router.use(path, function mounted_app(req, res, next) {
        const orig = req.app;
        fn.handle(req, res, function (err) {
          setPrototypeOf(req, orig.request)
          setPrototypeOf(res, orig.response)
          next(err);
        });
      });

      // mounted an app
      fn.emit('mount', this);
    }, this);

    return this;
  };

  /**
   * Proxy to the app `Router#route()`
   * Returns a new `Route` instance for the _path_.
   *
   * Routes are isolated middleware stacks for specific paths.
   * See the Route api docs for details.
   *
   * @public
   */

  route(path) {
    this.lazyrouter();
    return this._router.route(path);
  };

  /**
   * Proxy to `Router#param()` with one added api feature. The _name_ parameter
   * can be an array of names.
   *
   * See the Router#param() docs for more details.
   *
   * @param {String|Array} name
   * @param {Function} fn
   * @public
   */

  param(name, fn) {
    this.lazyrouter();

    if (Array.isArray(name)) {
      for (let i = 0; i < name.length; i++) this.param(name[i], fn);
      return this;
    }

    this._router.param(name, fn);

    return this;
  };

  /**
   * Assign `setting` to `val`, or return `setting`'s value.
   *
   *    app.set('foo', 'bar');
   *    app.set('foo');
   *    // => "bar"
   *
   * Mounted servers inherit their parent server's settings.
   *
   * @param {String} setting
   * @param {*} [val]
   * @public
   */

  set(setting: string, val?: any) {
    if (arguments.length === 1) {
      // app.get(setting)
      return this.settings[setting];
    }

    // set value
    this.settings[setting] = val;

    // trigger matched settings
    switch (setting) {
      case 'query parser':
        this.set('query parser fn', compileQueryParser(val));
        break;
      case 'trust proxy':
        this.set('trust proxy fn', compileTrust(val));

        // trust proxy inherit back-compat
        Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
          configurable: true,
          value: false
        });

        break;
    }

    return this;
  };

  /**
   * Return the app's absolute pathname
   * based on the parent(s) that have
   * mounted it.
   *
   * For example if the application was
   * mounted as "/admin", which itself
   * was mounted as "/blog" then the
   * return value would be "/blog/admin".
   *
   * @return {String}
   */

  path() {
    return String(this["parent"] ? this["parent"].path() + this.mountpath : '');
  };

  /**
   * Check if `setting` is enabled (truthy).
   *
   *    app.enabled('foo')
   *    // => false
   *
   *    app.enable('foo')
   *    app.enabled('foo')
   *    // => true
   *
   * @param {String} setting
   * @return {Boolean}
   * @public
   */

  enabled(setting) {
    return Boolean(this.set(setting));
  };

  /**
   * Check if `setting` is disabled.
   *
   *    app.disabled('foo')
   *    // => true
   *
   *    app.enable('foo')
   *    app.disabled('foo')
   *    // => false
   *
   * @param {String} setting
   * @return {Boolean}
   * @public
   */

  disabled(setting) {
    return !this.set(setting);
  };

  /**
   * Enable `setting`.
   *
   * @param {String} setting
   * @public
   */

  enable(setting) {
    return this.set(setting, true);
  };

  /**
   * Disable `setting`.
   *
   * @param {String} setting
   * @public
   */

  disable(setting) {
    return this.set(setting, false);
  };

  /**
   * Special-cased "all" method, applying the given route `path`,
   * middleware, and callback to _every_ HTTP method.
   *
   * @param {String} path
   * @public
   */

  all(path) {
    this.lazyrouter();

    const route = this._router.route(path);
    const args = slice.call(arguments, 1);

    for (let i = 0; i < methods.length; i++) {
      route[methods[i]].apply(route, args);
    }

    return this;
  };
}

Application.prototype.listen = function listen() {
  // @ts-ignore
  const server = http.createServer(this);
  return server.listen.apply(server, arguments);
};

methods.forEach(function (method) {
  Application.prototype[method] = function (this: Application, path: any) {
    if (method === 'get' && arguments.length === 1) {
      // app.get(setting)
      return this.set(path);
    }

    // @ts-ignore
    this.lazyrouter();

    const route = this._router.route(path);
    route[method].apply(route, slice.call(arguments, 1));
    return this;
  };
});