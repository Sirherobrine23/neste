export * from "./route.js";
import { createRoute, Neste } from "./route.js";
import http from "node:http";

interface createApp {
  /** Create Neste Route */
  Route: () => Neste;
}

export interface Server extends Neste {
  listen: http.Server["listen"];
}

/**
 *  Create New Neste app routes with app listen
*
* @returns App routes
*/
function createApp() {
  const app: Server = createRoute() as any;
  app.listen = function(...args: any[]) {
    return http.createServer().on("request", app).listen(...args);
  }
  return app;
}
createApp.Route = () => createRoute();

export default createApp;
export {createApp};