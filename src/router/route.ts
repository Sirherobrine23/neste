import { Handlers, Layer } from "./layer"
const __methods = [ "get", "head", "post", "put", "delete", "connect", "options", "trace" ] as const;
export type Methods = typeof __methods[number];
export const methods: Methods[] = Object.freeze(__methods) as any;

const toString = Object.prototype.toString;

export interface Route extends Record<typeof methods[number], (...handles: Handlers[]) => Route> {};
export class Route {
  path: string;
  methods: Record<string, boolean> = {};
  stack: Layer[] = [];
  constructor(path: string) {
    this.path = path;
  }

  _handles_method(method) {
    if (this.methods._all) {
      return true;
    }

    // normalize name
    let name = typeof method === 'string'
      ? method.toLowerCase()
      : method

    if (name === 'head' && !this.methods['head']) {
      name = 'get';
    }

    return Boolean(this.methods[name]);
  };

  /**
   * @return {Array} supported HTTP methods
   * @private
   */

  _options() {
    const methods = Object.keys(this.methods);

    // append automatic head
    if (this.methods.get && !this.methods.head) {
      methods.push('head');
    }

    for (let i = 0; i < methods.length; i++) {
      // make upper case
      methods[i] = methods[i].toUpperCase();
    }

    return methods;
  };

  /**
   * dispatch req, res into this route
   */

  dispatch(req, res, done) {
    let idx = 0, stack = this.stack, sync = 0

    if (stack.length === 0) {
      return done();
    }
    let method = typeof req.method === 'string' ? req.method.toLowerCase() : req.method

    if (method === 'head' && !this.methods['head']) {
      method = 'get';
    }

    req.route = this;

    next();

    function next(err?: any) {
      // signal to exit route
      if (err && err === 'route') {
        return done();
      }

      // signal to exit router
      if (err && err === 'router') {
        return done(err)
      }

      // max sync stack
      if (++sync > 100) {
        return setImmediate(next, err)
      }

      const layer = stack[idx++]

      // end of layers
      if (!layer) {
        return done(err)
      }

      if (layer.method && layer.method !== method) {
        next(err)
      } else if (err) {
        layer.handle_error(err, req, res, next);
      } else {
        layer.handle_request(req, res, next);
      }

      sync = 0
    }
  };

  /**
   * Add a handler for all HTTP verbs to this route.
   *
   * Behaves just like middleware and can respond or call `next`
   * to continue processing.
   *
   * You can use multiple `.all` call to add multiple handlers.
   *
   *   function check_something(req, res, next){
   *     next();
   *   };
   *
   *   function validate_user(req, res, next){
   *     next();
   *   };
   *
   *   route
   *   .all(validate_user)
   *   .all(check_something)
   *   .get(function(req, res, next){
   *     res.send('hello world');
   *   });
   *
   * @param {function} handler
   * @return {Route} for chaining
   * @api public
   */

  all(...handles: Handlers[]) {
    for (let i = 0; i < handles.length; i++) {
      const handle = handles[i];

      if (typeof handle !== 'function') {
        const type = toString.call(handle);
        const msg = 'Route.all() requires a callback function but got a ' + type
        throw new TypeError(msg);
      }

      const layer = new Layer('/', {}, handle);
      layer.method = undefined;

      this.methods._all = true;
      this.stack.push(layer);
    }

    return this;
  };
}

methods.forEach(function(method){
  Route.prototype[method] = function(this: Route, ...handles: Handlers[]){
    for (let i = 0; i < handles.length; i++) {
      const handle = handles[i];

      if (typeof handle !== 'function') {
        const type = toString.call(handle);
        const msg = 'Route.' + method + '() requires a callback function but got a ' + type
        throw new Error(msg);
      }

      const layer = new Layer('/', {}, handle);
      layer.method = method;

      this.methods[method] = true;
      this.stack.push(layer);
    }

    return this;
  };
});
