import { authenticated } from "../http.js";
import { listConversations } from "../mailbox.js";
export default authenticated("GET", (db, user, body, query) =>
  listConversations(db, user, query),
);
