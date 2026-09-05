import { authenticated } from "../http.js";
import { getConversation } from "../mailbox.js";
export default authenticated("GET", (db, user, body, query) =>
  getConversation(db, user, query.id, query.before),
);
