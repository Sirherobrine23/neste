export * from "./route.js";
import { createRoute, Neste } from "./route.js";
import http from "node:http";

interface createApp {
  /** Create Neste Route */
  Route: () => Neste;
}

export interface Server extends Neste {
  listen: http.Server["listen"]
}

createApp.Route = () => createRoute();
/**
 *  Create New Neste app routes with app listen
 *
 * @returns App routes
 */
function createApp(): Server {
  const app = createRoute();
  return Object.assign(app, {
    listen(...arg: any[]) {
      const server = http.createServer();
      server.on("request", app.callRequest);
      server.listen(...arg);
    }
  }) as any;
}

export default createApp;
export {createApp};