import { authenticated } from "../http.js";
import { markRead } from "../mailbox.js";
export default authenticated("POST", async (db, user, body) => {
  await markRead(db, user, body.messageIds);
  return {};
});
