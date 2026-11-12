import { storage } from "../storage";
import {
  RoomManager,
  INVITE_HOST_WINDOW_LIMIT,
  INVITE_ROOM_PENDING_LIMIT,
} from "./RoomManager";

export const roomManager = new RoomManager(storage);
export { INVITE_HOST_WINDOW_LIMIT, INVITE_ROOM_PENDING_LIMIT };
