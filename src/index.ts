import { CookieManeger, Handlers, ErrorRequestHandler, RequestHandler, WsRequestHandler, Layer, NextFunction, Request, Response, WsResponse } from "./handler.js";
import { Neste, Router, RouterSettings, RouterSettingsConfig } from "./application.js";

function router() { return new Router(); }
function neste() { return new Neste(); }
export { neste, router, CookieManeger, Handlers, ErrorRequestHandler, RequestHandler, WsRequestHandler, Layer, NextFunction, Request, Response, WsResponse, Neste, Router, RouterSettings, RouterSettingsConfig };
export default neste;