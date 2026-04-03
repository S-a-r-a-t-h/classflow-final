/**
 * useWebRTC.ts — WebRTC hook with screen sharing support.
 *
 * Features:
 *  - Camera + mic with toggle
 *  - Screen sharing via getDisplayMedia (replaceTrack, no renegotiation)
 *  - ICE candidate buffering (candidates before setRemoteDescription)
 *  - Stale WS guard (unmount safety)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Cookies from "js-cookie";
import { getWsBase } from "../utils/api";

export interface Participant {
  userId: string;
  name: string;
  role: string;
  handRaised: boolean;
  muted: boolean;
  stream?: MediaStream;
}

export interface ChatMessage {
  from: string;
  name: string;
  message: string;
  role: string;
  timestamp: Date;
}

interface UseWebRTCOptions {
  roomId: string;
  onChatMessage?: (m: ChatMessage) => void;
  onRecordingStatus?: (recording: boolean) => void;
  onForceMute?: (muted: boolean) => void;
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export function useWebRTC({
  roomId,
  onChatMessage,
  onRecordingStatus,
  onForceMute,
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [connected, setConnected] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null); // Keep camera stream for switching back
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const myUserIdRef = useRef<string | null>(null);
  const iceCandidateBuffers = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  const sendWs = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const updateParticipantStream = useCallback(
    (userId: string, stream: MediaStream) => {
      remoteStreamsRef.current[userId] = stream;
      setParticipants((prev) =>
        prev.map((p) => (p.userId === userId ? { ...p, stream } : p))
      );
    },
    []
  );

  const createPeer = useCallback(
    (remoteUserId: string, initiator: boolean) => {
      if (peersRef.current[remoteUserId]) {
        peersRef.current[remoteUserId].close();
        delete peersRef.current[remoteUserId];
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current[remoteUserId] = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      if (!remoteStreamsRef.current[remoteUserId]) {
        remoteStreamsRef.current[remoteUserId] = new MediaStream();
      }
      const remoteStream = remoteStreamsRef.current[remoteUserId];

      pc.ontrack = (event) => {
        const track = event.track;
        remoteStream.getTracks().forEach((t) => {
          if (t.kind === track.kind) remoteStream.removeTrack(t);
        });
        remoteStream.addTrack(track);
        const fresh = new MediaStream(remoteStream.getTracks());
        updateParticipantStream(remoteUserId, fresh);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWs({ type: "ice-candidate", target: remoteUserId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          console.warn(`Peer ${remoteUserId} connection failed`);
        }
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => sendWs({ type: "offer", target: remoteUserId, offer: pc.localDescription }))
          .catch(console.error);
      }

      return pc;
    },
    [sendWs, updateParticipantStream]
  );

  const flushIceCandidates = useCallback(async (remoteUserId: string) => {
    const buffer = iceCandidateBuffers.current[remoteUserId] || [];
    if (!buffer.length) return;
    const pc = peersRef.current[remoteUserId];
    if (!pc || !pc.remoteDescription) return;
    for (const candidate of buffer) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Buffered ICE candidate error:", e);
      }
    }
    delete iceCandidateBuffers.current[remoteUserId];
  }, []);

  const handleSignal = useCallback(
    async (data: any) => {
      switch (data.type) {
        case "room-state": {
          myUserIdRef.current = data.userId;
          setMyUserId(data.userId);
          const others = data.participants.filter(
            (p: Participant) => p.userId !== data.userId
          );
          setParticipants(others);
          setConnected(true);
          others.forEach((p: Participant) => createPeer(p.userId, true));
          break;
        }
        case "user-joined": {
          const others = data.participants.filter(
            (p: Participant) => p.userId !== myUserIdRef.current
          );
          setParticipants(others);
          break;
        }
        case "user-left": {
          const others = data.participants.filter(
            (p: Participant) => p.userId !== myUserIdRef.current
          );
          setParticipants(others);
          if (peersRef.current[data.userId]) {
            peersRef.current[data.userId].close();
            delete peersRef.current[data.userId];
          }
          delete remoteStreamsRef.current[data.userId];
          delete iceCandidateBuffers.current[data.userId];
          break;
        }
        case "offer": {
          const pc = createPeer(data.from, false);
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          await flushIceCandidates(data.from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWs({ type: "answer", target: data.from, answer: pc.localDescription });
          break;
        }
        case "answer": {
          const pc = peersRef.current[data.from];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await flushIceCandidates(data.from);
          }
          break;
        }
        case "ice-candidate": {
          const pc = peersRef.current[data.from];
          if (pc && pc.remoteDescription && data.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.warn("ICE candidate error:", e);
            }
          } else if (data.candidate) {
            if (!iceCandidateBuffers.current[data.from]) {
              iceCandidateBuffers.current[data.from] = [];
            }
            iceCandidateBuffers.current[data.from].push(data.candidate);
          }
          break;
        }
        case "chat": {
          onChatMessage?.({
            from: data.from,
            name: data.name,
            message: data.message,
            role: data.role,
            timestamp: new Date(),
          });
          break;
        }
        case "hand-raised": {
          setParticipants((prev) =>
            prev.map((p) =>
              p.userId === data.userId ? { ...p, handRaised: data.raised } : p
            )
          );
          break;
        }
        case "participant-muted": {
          setParticipants((prev) =>
            prev.map((p) =>
              p.userId === data.userId ? { ...p, muted: data.muted } : p
            )
          );
          break;
        }
        case "force-mute": {
          onForceMute?.(data.muted);
          break;
        }
        case "recording-status": {
          onRecordingStatus?.(data.recording);
          break;
        }
      }
    },
    [createPeer, flushIceCandidates, sendWs, onChatMessage, onRecordingStatus, onForceMute]
  );

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;
    let ws: WebSocket;

    const init = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          if (mounted) setCameraOn(false);
        } catch {
          stream = new MediaStream();
          if (mounted) { setCameraOn(false); setMicOn(false); }
        }
      }

      if (!mounted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      cameraStreamRef.current = stream;
      setLocalStream(new MediaStream(stream.getTracks()));

      const token = Cookies.get("token");
      const wsUrl = `${getWsBase()}/ws/${roomId}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
      ws.onmessage = (event) => {
        try { handleSignal(JSON.parse(event.data)); } catch (e) { console.error("WS parse error", e); }
      };
      ws.onclose = () => { if (mounted) setConnected(false); };
      ws.onerror = (e) => console.error("WS error", e);
    };

    init();

    return () => {
      mounted = false;
      try { ws?.close(); } catch {}
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenTrackRef.current?.stop();
      Object.values(peersRef.current).forEach((pc) => pc.close());
      peersRef.current = {};
      remoteStreamsRef.current = {};
      iceCandidateBuffers.current = {};
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera toggle ──────────────────────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    if (!localStreamRef.current) return;

    if (cameraOn) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      setCameraOn(false);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newStream.getVideoTracks()[0];

        for (const pc of Object.values(peersRef.current)) {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(newTrack);
          else pc.addTrack(newTrack, localStreamRef.current!);
        }

        localStreamRef.current.getVideoTracks().forEach((t) => {
          t.stop();
          localStreamRef.current!.removeTrack(t);
        });
        localStreamRef.current.addTrack(newTrack);
        cameraStreamRef.current = new MediaStream([
          newTrack,
          ...localStreamRef.current.getAudioTracks(),
        ]);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setCameraOn(true);
        setScreenSharing(false);
      } catch (err) {
        console.error("Camera re-enable failed:", err);
      }
    }
  }, [cameraOn]);

  // ── Mic toggle ─────────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();

    if (micOn) {
      audioTracks.forEach((t) => (t.enabled = false));
      setMicOn(false);
    } else {
      if (audioTracks.length > 0) {
        audioTracks.forEach((t) => (t.enabled = true));
        setMicOn(true);
      } else {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const newTrack = newStream.getAudioTracks()[0];
          for (const pc of Object.values(peersRef.current)) {
            const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
            if (sender) await sender.replaceTrack(newTrack);
            else pc.addTrack(newTrack, localStreamRef.current!);
          }
          localStreamRef.current.addTrack(newTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          setMicOn(true);
        } catch (err) {
          console.error("Mic re-enable failed:", err);
        }
      }
    }
  }, [micOn]);

  // ── Screen Share ───────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    if (screenSharing) return;
    try {
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { cursor: "always" },
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;

      // Replace video track in all peer connections
      for (const pc of Object.values(peersRef.current)) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack);
      }

      // Update local stream display
      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      const screenDisplayStream = new MediaStream([screenTrack, ...audioTracks]);

      // Stop old video tracks
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      localStreamRef.current?.addTrack(screenTrack);

      setLocalStream(screenDisplayStream);
      setScreenSharing(true);
      setCameraOn(false);

      // Handle user stopping share via browser UI
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        console.error("Screen share failed:", err);
      }
    }
  }, [screenSharing]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopScreenShare = useCallback(async () => {
    if (!screenSharing && !screenTrackRef.current) return;

    // Stop screen track
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;

    // Re-acquire camera
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const cameraTrack = cameraStream.getVideoTracks()[0];

      // Replace back in all peers
      for (const pc of Object.values(peersRef.current)) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(cameraTrack);
      }

      // Update local stream
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      localStreamRef.current?.addTrack(cameraTrack);

      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      setLocalStream(new MediaStream([cameraTrack, ...audioTracks]));
      setScreenSharing(false);
      setCameraOn(true);
    } catch (err) {
      console.error("Failed to restore camera after screen share:", err);
      setScreenSharing(false);
    }
  }, [screenSharing]);

  const sendChat = useCallback((message: string) => sendWs({ type: "chat", message }), [sendWs]);
  const raiseHand = useCallback((raised: boolean) => sendWs({ type: "raise-hand", raised }), [sendWs]);
  const muteUser = useCallback((userId: string, muted: boolean) => sendWs({ type: "mute-user", target: userId, muted }), [sendWs]);
  const broadcastRecordingStatus = useCallback((recording: boolean) => sendWs({ type: "recording-status", recording }), [sendWs]);

  return {
    localStream,
    participants,
    cameraOn,
    micOn,
    connected,
    myUserId,
    screenSharing,
    toggleCamera,
    toggleMic,
    startScreenShare,
    stopScreenShare,
    sendChat,
    raiseHand,
    muteUser,
    broadcastRecordingStatus,
  };
}
