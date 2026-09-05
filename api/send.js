import { authenticated } from "../http.js";
import { prepareSend, deliver } from "../outbound.js";
export default authenticated("POST", async (db, user, body) => {
  const row = await prepareSend(db, user, body);
  return deliver(db, user, row.id);
});
