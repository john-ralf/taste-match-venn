import type { ListenerProfile } from "@/lib/music";

export type RoomPayload = {
  id: string;
  listeners: ListenerProfile[];
  createdAt: string;
  updatedAt: string;
};

export type RoomSaveRequest = {
  listeners?: ListenerProfile[];
};
