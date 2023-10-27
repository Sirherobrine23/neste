const __methods = [ "ws", "get", "post", "put", "delete", "head", "connect", "options", "trace" ] as const;
export type Methods = typeof __methods[number];
export const methods: Methods[] = Object.freeze(__methods) as any;

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
    if (!redefine && Object.hasOwnProperty.call(dest, name)) return;

    // Copy descriptor
    var descriptor = Object.getOwnPropertyDescriptor(src, name);
    Object.defineProperty(dest, name, descriptor);
  });

  return dest as any;
}

export function defineProperties(obj: any, config: Record<string, PropertyDescriptor & ThisType<any>>, redefine?: boolean) {
  if (redefine === undefined) redefine = true; // Default to true
  for (let key in config) {
    // Skip desriptor
    if (!redefine && Object.hasOwnProperty.call(obj, key)) continue;
    else Object.defineProperty(obj, key, config[key]);
  }
  return obj;
}