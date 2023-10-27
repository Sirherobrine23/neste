import { CookieManeger, Layer, Request, Response, WsResponse } from "./handler.js";
import { Neste, Router, RouterSettings, WsRoom } from "./application.js";

export { staticFile } from "./middles/staticFile.js";
export { parseBody } from "./middles/bodyParse.js";
export type { FileStorage, LocalFile, ParseBodyOptions } from "./middles/bodyParse.js";

export type { Handlers, ErrorRequestHandler, RequestHandler, WsRequestHandler, NextFunction } from "./handler.js";
export type { RouterSettingsConfig } from "./application.js";

function router() { return new Router(); }
function neste() { return new Neste(); }
export { neste, router, CookieManeger, Layer, Request, Response, WsResponse, Neste, Router, RouterSettings, WsRoom };
export default neste;