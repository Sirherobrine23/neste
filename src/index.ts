export * from "./route.js";
import { Neste } from "./route.js";

/**
 * Extends for Neste with includes Server Listen
 */
export class NesteApp extends Neste {}

interface createApp {
  /** Create Neste Route */
  Route: () => Neste;
}

createApp.Route = () => new Neste();
/**
 *  Create New Neste app routes with app listen
 *
 * @returns App routes
 */
function createApp() {
  return new NesteApp();
}

export default createApp;
export {createApp};