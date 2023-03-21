export * from "./route.js";
import { createRoute, Neste } from "./route.js";
import http from "node:http";

interface createApp {
  /** Create Neste Route */
  Route: () => Neste;
}

export class Server extends Neste {
  listen(...args: Parameters<http.Server["listen"]>) {
    return http.createServer().on("request", this).listen(...args);
  }
}

/**
 *  Create New Neste app routes with app listen
 *
 * @returns App routes
 */
function createApp() {
  return new Server();
}
createApp.Route = () => createRoute();

export default createApp;
export {createApp};