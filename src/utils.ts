import contentDisposition from "content-disposition";
import proxyaddr from "proxy-addr";
import contentType from "content-type";
import qs from "qs";
import { mime } from "send";
export { contentDisposition };

const __methods = [ "get", "head", "post", "put", "delete", "connect", "options", "trace" ] as const;
export type Methods = typeof __methods[number];
export const methods: Methods[] = Object.freeze(__methods) as any;

function setProtoOf(obj: any, proto: any) {
  obj.__proto__ = proto;
  return obj;
}

function mixinProperties(obj, proto) {
  for (var prop in proto) { if (!Object.prototype.hasOwnProperty.call(obj, prop)) { obj[prop] = proto[prop]; } }
  return obj;
}

export const setPrototypeOf = Object.setPrototypeOf || ({ __proto__: [] } instanceof Array ? setProtoOf : mixinProperties);
export function merge(a, b){
  if (a && b) {
    for (var key in b) {
      a[key] = b[key];
    }
  }
  return a;
}

/*!
 * merge-descriptors
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
var hasOwnProperty = Object.prototype.hasOwnProperty

/**
 * Merge the property descriptors of `src` into `dest`
 *
 * @param dest Object to add descriptors to
 * @param src Object to clone descriptors from
 * @param {boolean} [redefine=true] Redefine `dest` properties with `src` properties
 */
export function mixin<T, C>(dest: T, src: C, redefine?: boolean): T & C {
  if (!dest) throw new TypeError('argument dest is required');
  if (!src) throw new TypeError('argument src is required');
  if (redefine === undefined) redefine = true; // Default to true

  Object.getOwnPropertyNames(src).forEach(function forEachOwnPropertyName(name) {
    // Skip desriptor
    if (!redefine && hasOwnProperty.call(dest, name)) return;

    // Copy descriptor
    var descriptor = Object.getOwnPropertyDescriptor(src, name);
    Object.defineProperty(dest, name, descriptor);
  });

  return dest as any;
}

/**
 * Check if `path` looks absolute.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

export function isAbsolute(path){
  if ('/' === path[0]) return true;
  if (':' === path[1] && ('\\' === path[2] || '/' === path[2])) return true; // Windows device path
  if ('\\\\' === path.substring(0, 2)) return true; // Microsoft Azure absolute path
  return false;
};

type PickValue<T> = T extends ReadonlyArray<any> ? { [K in Extract<keyof T, number>]: PickValue<T[K]>; }[number] : T;
type FlatArray<T extends ArrayLike<any>> = Array<PickValue<T[number]>>;
export function flatten<T extends any[]>(args: T): FlatArray<T> {
  return Array.from(args).flat(Infinity);
};

/**
 * Helper function for creating a getter on an object.
 *
 * @param {Object} obj
 * @param {String} name
 * @param {Function} getter
 * @private
 */
export function defineGetter<T extends Record<string, any>, C extends string>(obj: T, name: C, getter: (this: T, ...args: Parameters<T[C]>) => void) {
  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: true,
    get: getter
  });
}

/**
 * Normalize the given `type`, for example "html" becomes "text/html".
 *
 * @param {String} type
 * @return {Object}
 * @api private
 */

export function normalizeType(type){
  return ~type.indexOf('/')
    ? acceptParams(type)
    : { value: mime.lookup(type), params: {} };
};

/**
 * Normalize `types`, for example "html" becomes "text/html".
 *
 * @param {Array} types
 * @return {Array}
 * @api private
 */

export function normalizeTypes(types){
  const ret = [];

  for (let i = 0; i < types.length; ++i) ret.push(normalizeType(types[i]));

  return ret;
};

/**
 * Parse accept params `str` returning an
 * object with `.value`, `.quality` and `.params`.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function acceptParams(str) {
  const parts = str.split(/ *; */);
  const ret = { value: parts[0], quality: 1, params: {} }

  for (let i = 1; i < parts.length; ++i) {
    const pms = parts[i].split(/ *= */);
    if ('q' === pms[0]) {
      ret.quality = parseFloat(pms[1]);
    } else {
      ret.params[pms[0]] = pms[1];
    }
  }

  return ret;
}

/**
 * Compile "query parser" value to function.
 *
 * @return {Function}
 * @api private
 */

export function compileQueryParser(val: string|boolean|Function) {
  let fn: Function;
  if (typeof val === 'function') return val;
  switch (val) {
    case true:
    case 'simple':
      fn = function(qs, sep, eq) {
        sep = sep || '&';
        eq = eq || '=';
        var obj = {};
        if (typeof qs !== 'string' || qs.length === 0) return obj;
        qs.split(sep).forEach(function(kvp) {
          var x = kvp.split(eq);
          var k = decodeURIComponent(x[0]);
          var v = decodeURIComponent(x.slice(1).join(eq));

          if (!(k in obj)) obj[k] = v;
          else if (!Array.isArray(obj[k])) obj[k] = [obj[k], v];
          else obj[k].push(v);
        });

        return obj;
      };
      break;
    case false:
      fn = newObject;
      break;
    case 'extended':
      fn = parseExtendedQueryString;
      break;
    default:
      throw new TypeError('unknown value for query parser function: ' + val);
  }

  return fn;
}

/**
 * Compile "proxy trust" value to function.
 *
 * @param  {Boolean|String|Number|Array|Function} val
 * @return {Function}
 * @api private
 */

export function compileTrust(val) {
  if (typeof val === 'function') return val;

  if (val === true) {
    // Support plain true/false
    return function(){ return true };
  }

  if (typeof val === 'number') {
    // Support trusting hop count
    return function(a, i){ return i < val };
  }

  if (typeof val === 'string') {
    // Support comma-separated values
    val = val.split(',')
      .map(function (v) { return v.trim() })
  }

  return proxyaddr.compile(val || []);
}

/**
 * Set the charset in a given Content-Type string.
 *
 * @param {String} type
 * @param {String} charset
 * @return {String}
 * @api private
 */

export function setCharset(type, charset) {
  if (!type || !charset) {
    return type;
  }

  // parse type
  const parsed = contentType.parse(type);

  // set charset
  parsed.parameters.charset = charset;

  // format type
  return contentType.format(parsed);
};

/**
 * Parse an extended query string with qs.
 *
 * @param {String} str
 * @return {Object}
 * @private
 */

function parseExtendedQueryString(str) {
  return qs.parse(str, {
    allowPrototypes: true
  });
}

/**
 * Return new empty object.
 *
 * @return {Object}
 * @api private
 */

function newObject() {
  return {};
}