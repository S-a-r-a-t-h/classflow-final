import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../hooks/useAuth";
import { useWebRTC, ChatMessage } from "../../hooks/useWebRTC";
import { useRecording } from "../../hooks/useRecording";
import VideoTile from "../../components/VideoTile";
import ChatSidebar from "../../components/ChatSidebar";
import ParticipantsSidebar from "../../components/ParticipantsSidebar";
import api, { getBackendBase } from "../../utils/api";

type SidePanel = "chat" | "participants" | null;

export default function RoomPage() {
  const router = useRouter();
  const { id: roomId } = router.query as { id: string };
  const { user, loading } = useAuth();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sidePanel, setSidePanel] = useState<SidePanel>("chat");
  const [classStarted, setClassStarted] = useState(false);
  const [unread, setUnread] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  const [forceMuted, setForceMuted] = useState(false);
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [topicInput, setTopicInput] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (roomId) {
      api
        .get(`/api/rooms/${roomId}`)
        .then((r) => {
          setRoomInfo(r.data);
          setTopicInput(r.data.topic || "");
        })
        .catch(console.error);
    }
  }, [roomId]);

  const {
    localStream,
    participants,
    cameraOn,
    micOn,
    connected,
    screenSharing,
    toggleCamera,
    toggleMic,
    startScreenShare,
    stopScreenShare,
    sendChat,
    raiseHand,
    muteUser,
    broadcastRecordingStatus,
  } = useWebRTC({
    roomId: roomId || "",
    onChatMessage: (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      if (sidePanel !== "chat") setUnread((u) => u + 1);
    },
    onRecordingStatus: () => {},
    onForceMute: (muted) => setForceMuted(muted),
  });

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const { recording, filename, startRecording, stopRecording } = useRecording(
    () => localStreamRef.current
  );

  const classLink =
    typeof window !== "undefined" && roomId
      ? `${window.location.origin}/class/${roomId}`
      : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(classLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      const el = document.createElement("textarea");
      el.value = classLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }
  };

  const startClass = async () => {
    setClassStarted(true);
    if (user?.role === "teacher") {
      await api
        .patch(`/api/rooms/${roomId}/active`, { active: true, topic: topicInput })
        .catch(console.error);
      await startRecording({
        className: roomInfo?.name || "Class",
        topicName: topicInput || "Lecture",
        roomId: roomId,
      });
      broadcastRecordingStatus(true);
    }
  };

  const endClass = async () => {
    if (user?.role === "teacher") {
      broadcastRecordingStatus(false);
      await stopRecording();
      await api.patch(`/api/rooms/${roomId}/active`, { active: false }).catch(console.error);
    }
    router.push("/dashboard");
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    raiseHand(next);
  };

  const handleSendChat = (msg: string) => {
    sendChat(msg);
    setChatMessages((prev) => [
      ...prev,
      { from: "me", name: user?.name || "You", message: msg, role: user?.role || "student", timestamp: new Date() },
    ]);
  };

  const openPanel = (panel: SidePanel) => {
    setSidePanel(sidePanel === panel ? null : panel);
    if (panel === "chat") setUnread(0);
  };

  if (loading || !user || !roomId) return null;

  // Pre-class waiting screen
  if (!classStarted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-blue-600 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.266a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-white font-bold text-lg leading-tight">{roomInfo?.name || "Class Room"}</h1>
                  {roomInfo?.subject && <p className="text-blue-100 text-sm">{roomInfo.subject}</p>}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-yellow-400 animate-pulse"}`} />
                <span className="text-sm text-gray-600">{connected ? "Connected to room" : "Connecting..."}</span>
              </div>

              {localStream && (
                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                  <VideoTile stream={localStream} name={user.name} isLocal cameraOn={cameraOn} muted />
                </div>
              )}

              {user.role === "teacher" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Topic / Lecture Title</label>
                  <input
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="e.g. Introduction to Derivatives"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              {user.role === "teacher" && roomId && (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700">Share Class Link</span>
                    <button onClick={() => setShowLinkPanel(!showLinkPanel)} className="text-blue-600 text-xs hover:underline">
                      {showLinkPanel ? "Hide" : "Show"}
                    </button>
                  </div>
                  {showLinkPanel && (
                    <>
                      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 mb-2">
                        <span className="text-gray-500 text-xs truncate flex-1 font-mono">{classLink}</span>
                      </div>
                      <button
                        onClick={copyLink}
                        className={`w-full py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${linkCopied ? "bg-green-50 text-green-700 border border-green-200" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                      >
                        {linkCopied ? "Link Copied!" : "Copy Link"}
                      </button>
                      <p className="text-xs text-gray-400 mt-2 text-center">Students can join directly using this link</p>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                {user.role === "teacher" ? (
                  <button
                    onClick={startClass}
                    disabled={!connected}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
                  >
                    Start Class
                  </button>
                ) : (
                  <button
                    onClick={startClass}
                    disabled={!connected}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
                  >
                    Join Class
                  </button>
                )}
                <Link href="/dashboard" className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition text-sm flex items-center">
                  Back
                </Link>
              </div>

              {user.role === "teacher" && (
                <p className="text-xs text-gray-400 text-center">Recording will start automatically when you start the class.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Live class UI
  const allParticipants = [...participants];
  const totalCount = allParticipants.length + 1;
  const gridClass =
    totalCount === 1 ? "grid-cols-1 max-w-2xl mx-auto" :
    totalCount === 2 ? "grid-cols-1 sm:grid-cols-2" :
    totalCount <= 4 ? "grid-cols-2" :
    "grid-cols-2 lg:grid-cols-3";

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden">
      {/* Top bar */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">C</span>
          </div>
          <div className="min-w-0">
            <span className="text-white font-semibold text-sm truncate block">{roomInfo?.name || "Live Class"}</span>
            {(roomInfo?.topic || topicInput) && (
              <span className="text-gray-400 text-xs truncate block">{roomInfo?.topic || topicInput}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {recording && (
            <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium bg-red-900/30 px-2.5 py-1 rounded-full border border-red-700/40">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              REC
            </div>
          )}
          {screenSharing && (
            <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium bg-blue-900/30 px-2.5 py-1 rounded-full border border-blue-700/40">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Sharing Screen
            </div>
          )}
          {forceMuted && (
            <span className="text-xs text-orange-300 bg-orange-900/30 border border-orange-700/40 px-2.5 py-1 rounded-full">Muted by teacher</span>
          )}
          {user.role === "teacher" && classLink && (
            <button
              onClick={copyLink}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition ${linkCopied ? "text-green-400 border-green-700/40 bg-green-900/20" : "text-gray-300 border-gray-600 bg-gray-700 hover:bg-gray-600"}`}
            >
              {linkCopied ? "Copied" : "Share Link"}
            </button>
          )}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
            {totalCount} in room
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-3 bg-gray-900">
          <div className={`grid ${gridClass} gap-3`}>
            <VideoTile stream={localStream} name={`${user.name}${screenSharing ? " (Screen)" : ""}`} isLocal cameraOn={cameraOn || screenSharing} muted />
            {allParticipants.map((p) => (
              <VideoTile key={p.userId} stream={p.stream || null} name={p.name} muted={p.muted} handRaised={p.handRaised} cameraOn />
            ))}
          </div>
        </main>

        {sidePanel && (
          <aside className="w-72 flex-shrink-0 hidden md:flex flex-col">
            {sidePanel === "chat" ? (
              <ChatSidebar messages={chatMessages} onSend={handleSendChat} myName={user.name} onClose={() => setSidePanel(null)} />
            ) : (
              <ParticipantsSidebar participants={allParticipants} myName={user.name} myRole={user.role} onMuteUser={user.role === "teacher" ? muteUser : undefined} onClose={() => setSidePanel(null)} />
            )}
          </aside>
        )}
      </div>

      {/* Controls bar */}
      <footer className="h-20 bg-gray-800 border-t border-gray-700 flex items-center justify-center gap-2 px-4 flex-shrink-0">
        {/* Mic */}
        <ControlButton
          active={micOn && !forceMuted}
          danger={!micOn || forceMuted}
          onClick={toggleMic}
          title={micOn && !forceMuted ? "Mute" : "Unmute"}
          label="Mic"
          icon={
            micOn && !forceMuted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )
          }
        />

        {/* Camera */}
        <ControlButton
          active={cameraOn}
          danger={!cameraOn && !screenSharing}
          onClick={toggleCamera}
          title={cameraOn ? "Turn off camera" : "Turn on camera"}
          label="Camera"
          icon={
            cameraOn ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.266a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.266a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
              </svg>
            )
          }
        />

        {/* Screen Share */}
        <ControlButton
          active={!screenSharing}
          highlight={screenSharing}
          onClick={screenSharing ? stopScreenShare : startScreenShare}
          title={screenSharing ? "Stop sharing screen" : "Share screen"}
          label={screenSharing ? "Stop Share" : "Share"}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />

        {/* Raise Hand (students) */}
        {user.role === "student" && (
          <ControlButton
            active={!handRaised}
            highlight={handRaised}
            onClick={toggleHand}
            title={handRaised ? "Lower hand" : "Raise hand"}
            label="Hand"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
              </svg>
            }
          />
        )}

        {/* Chat */}
        <ControlButton
          active
          selected={sidePanel === "chat"}
          onClick={() => openPanel("chat")}
          title="Chat"
          label="Chat"
          badge={unread > 0 ? unread : undefined}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          }
        />

        {/* Participants */}
        <ControlButton
          active
          selected={sidePanel === "participants"}
          onClick={() => openPanel("participants")}
          title="Participants"
          label="People"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />

        {/* End / Leave */}
        <button
          onClick={endClass}
          className="ml-3 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm"
        >
          {user.role === "teacher" ? "End Class" : "Leave"}
        </button>
      </footer>
    </div>
  );
}

function ControlButton({
  active, onClick, icon, title, danger, highlight, selected, badge, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  danger?: boolean;
  highlight?: boolean;
  selected?: boolean;
  badge?: number;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        title={title}
        className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition border ${
          danger ? "bg-red-700/30 border-red-600/50 text-red-300 hover:bg-red-700/50" :
          highlight ? "bg-blue-600/40 border-blue-500/60 text-blue-200 hover:bg-blue-600/50" :
          selected ? "bg-blue-600/30 border-blue-500/50 text-blue-300" :
          "bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
        }`}
      >
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      {label && <span className="text-gray-500 text-xs">{label}</span>}
    </div>
  );
}
