"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWsBaseUrl } from "./api-client";
import type { MeetingActiveRead, MeetingSectionTimerRead } from "./types";

interface WsSnapshotMessage {
  type: "MEETING_SNAPSHOT";
  team_id: string;
  meeting: MeetingActiveRead | null;
}

interface WsTimerTickMessage {
  type: "TIMER_TICK";
  team_id: string;
  meeting_id: string;
  timer: MeetingSectionTimerRead;
}

interface WsDomainEventMessage {
  type: "DOMAIN_EVENT";
  event_type: string;
  team_id: string;
  payload: Record<string, unknown>;
}

type WsMessage = WsSnapshotMessage | WsTimerTickMessage | WsDomainEventMessage | { type: "pong" };

export function useTeamRealtime(
  teamId: string | undefined,
  accessToken: string | null,
  onDomainEvent?: (eventType: string, payload: Record<string, unknown>) => void
) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [liveTimer, setLiveTimer] = useState<MeetingSectionTimerRead | null>(null);
  const [liveMeeting, setLiveMeeting] = useState<MeetingActiveRead | null | undefined>(
    undefined
  );
  const eventHandlerRef = useRef(onDomainEvent);

  useEffect(() => {
    eventHandlerRef.current = onDomainEvent;
  }, [onDomainEvent]);

  useEffect(() => {
    if (!teamId || !accessToken) {
      return;
    }

    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const wsUrl = `${getWsBaseUrl()}/api/ws/teams/${encodeURIComponent(
        teamId
      )}?token=${encodeURIComponent(accessToken)}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as WsMessage;
          if (msg.type === "MEETING_SNAPSHOT") {
            setLiveMeeting(msg.meeting);
            setLiveTimer(msg.meeting ? msg.meeting.timer : null);
            queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
            queryClient.invalidateQueries({ queryKey: ["active-meeting", teamId] });
          } else if (msg.type === "TIMER_TICK") {
            setLiveTimer(msg.timer);
          } else if (msg.type === "DOMAIN_EVENT") {
            if (msg.payload?.meeting) {
              const updatedMeeting = msg.payload.meeting as MeetingActiveRead;
              setLiveMeeting(updatedMeeting);
              setLiveTimer(updatedMeeting.timer);
            } else if (msg.event_type === "MeetingEnded") {
              setLiveMeeting(null);
              setLiveTimer(null);
            } else {
              setLiveMeeting(undefined);
            }
            queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
            queryClient.invalidateQueries({ queryKey: ["team-scorecard", teamId] });
            queryClient.invalidateQueries({ queryKey: ["team-issues", teamId] });
            queryClient.invalidateQueries({ queryKey: ["team-todos", teamId] });
            queryClient.invalidateQueries({ queryKey: ["team-rocks", teamId] });
            queryClient.invalidateQueries({ queryKey: ["active-meeting", teamId] });
            queryClient.invalidateQueries({ queryKey: ["team-audit", teamId] });
            eventHandlerRef.current?.(msg.event_type, msg.payload || {});
          }
        } catch {
          // ignore malformed frame
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          const delay = Math.min(4000, 400 * Math.pow(1.6, attempt));
          attempt += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      setConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [teamId, accessToken, queryClient]);

  return { connected, liveTimer, liveMeeting };
}
