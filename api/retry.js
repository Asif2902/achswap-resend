import { authenticated } from "../http.js";
import { deliver } from "../outbound.js";
export default authenticated("POST", (db, user, body) =>
  deliver(db, user, body.id),
);
