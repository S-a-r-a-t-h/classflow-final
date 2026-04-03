import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../hooks/useAuth";
import api, { getBackendBase } from "../utils/api";

interface Room {
  id: string;
  name: string;
  subject: string;
  topic: string;
  teacherName: string;
  active: boolean;
  createdAt: string;
}

interface Recording {
  filename: string;
  size: number;
  created: string;
  class_name: string;
  topic_name: string;
  date: string;
  time: string;
  timestamp: string;
  room_id: string;
}

type Tab = "rooms" | "recordings";

export default function DashboardPage() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomSubject, setNewRoomSubject] = useState("");
  const [newRoomTopic, setNewRoomTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("rooms");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const loadData = useCallback(() => {
    if (!user) return;
    api.get("/api/rooms/").then((r) => setRooms(r.data)).catch(console.error);
    api.get("/api/rooms/recordings/").then((r) => setRecordings(r.data)).catch(console.error);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post("/api/rooms/", {
        name: newRoomName,
        subject: newRoomSubject,
        topic: newRoomTopic,
      });
      setRooms((prev) => [res.data, ...prev]);
      setNewRoomName("");
      setNewRoomSubject("");
      setNewRoomTopic("");
      setShowCreate(false);
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to create room");
    } finally {
      setCreating(false);
    }
  };

  const copyClassLink = async (roomId: string) => {
    const link = `${window.location.origin}/class/${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement("textarea");
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(roomId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStreamUrl = (filename: string) => {
    return `${getBackendBase()}/api/rooms/recordings/stream/${filename}`;
  };

  const getDownloadUrl = (filename: string) => {
    return `${getBackendBase()}/api/rooms/recordings/${filename}`;
  };

  const openPlayer = (rec: Recording) => {
    setPlayingRecording(rec);
  };

  const closePlayer = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
    setPlayingRecording(null);
  };

  const handleDownload = async (rec: Recording) => {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];

    const url = getDownloadUrl(rec.filename);
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.filename;
    // Use fetch to attach auth header for download
    try {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback to direct link
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Video Player Modal */}
      {playingRecording && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={closePlayer}>
          <div className="bg-gray-900 rounded-2xl overflow-hidden w-full max-w-4xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Player header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
              <div>
                <h2 className="text-white font-semibold text-sm">{playingRecording.class_name}</h2>
                <p className="text-gray-400 text-xs">{playingRecording.topic_name} — {playingRecording.date} {playingRecording.time}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDownload(playingRecording)}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
                <button onClick={closePlayer} className="text-gray-400 hover:text-white transition p-1 rounded-lg hover:bg-gray-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Video element */}
            <div className="bg-black">
              <video
                ref={videoRef}
                controls
                autoPlay
                className="w-full max-h-[70vh] outline-none"
                style={{ display: "block" }}
                onError={(e) => {
                  console.error("Video error:", e);
                }}
              >
                <source src={getStreamUrl(playingRecording.filename)} type="video/webm" />
                <source src={getStreamUrl(playingRecording.filename)} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Player info bar */}
            <div className="px-5 py-3 flex items-center justify-between border-t border-gray-700">
              <span className="text-gray-400 text-xs">{formatBytes(playingRecording.size)}</span>
              <span className="text-gray-400 text-xs font-mono">{playingRecording.filename}</span>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">ClassFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${user.role === "teacher" ? "bg-purple-500" : "bg-blue-500"}`} />
              <span className="text-sm font-medium text-gray-700">{user.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.role === "teacher" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                {user.role}
              </span>
            </div>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 transition font-medium">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Page header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">
              {user.role === "teacher" ? "Manage your classes and recordings." : "Join a class or view recordings."}
            </p>
          </div>
          {user.role === "teacher" && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Class
            </button>
          )}
        </div>

        {/* Create room panel */}
        {showCreate && user.role === "teacher" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Create New Class</h2>
            <form onSubmit={createRoom} className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Class Name *</label>
                  <input
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Mathematics Grade 10"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    value={newRoomSubject}
                    onChange={(e) => setNewRoomSubject(e.target.value)}
                    placeholder="e.g. Mathematics"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Default Topic</label>
                  <input
                    value={newRoomTopic}
                    onChange={(e) => setNewRoomTopic(e.target.value)}
                    placeholder="e.g. Algebra"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg text-sm transition">
                  {creating ? "Creating..." : "Create Class"}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-sm transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setActiveTab("rooms")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab === "rooms" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            Classes
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === "rooms" ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"}`}>
              {rooms.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("recordings")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab === "recordings" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            Recordings
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === "recordings" ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"}`}>
              {recordings.length}
            </span>
          </button>
        </div>

        {/* Rooms tab */}
        {activeTab === "rooms" && (
          <div>
            {rooms.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.266a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">No classes yet.</p>
                {user.role === "teacher" && (
                  <button onClick={() => setShowCreate(true)} className="mt-3 text-blue-600 text-sm font-medium hover:underline">
                    Create your first class
                  </button>
                )}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                  <div key={room.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <h3 className="text-white font-semibold text-sm truncate">{room.name}</h3>
                          {room.subject && <p className="text-blue-200 text-xs mt-0.5">{room.subject}</p>}
                        </div>
                        {room.active && (
                          <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                            Live
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      {room.topic && (
                        <p className="text-gray-600 text-xs truncate">Topic: {room.topic}</p>
                      )}
                      <p className="text-gray-400 text-xs">By {room.teacherName}</p>

                      <div className="flex gap-2 pt-1">
                        <Link
                          href={`/room/${room.id}`}
                          className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition"
                        >
                          {user.role === "teacher" ? "Open Room" : "Join Class"}
                        </Link>
                        {user.role === "teacher" && (
                          <button
                            onClick={() => copyClassLink(room.id)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition border ${copiedId === room.id ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                          >
                            {copiedId === room.id ? "Copied" : "Copy Link"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recordings tab */}
        {activeTab === "recordings" && (
          <div>
            {recordings.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">No recordings yet.</p>
                <p className="text-gray-400 text-xs mt-1">Recordings are created automatically when a class starts.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recordings.map((rec) => (
                  <div key={rec.filename} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition">
                    {/* Thumbnail / play area */}
                    <div
                      className="bg-gray-900 h-36 flex items-center justify-center cursor-pointer group relative"
                      onClick={() => openPlayer(rec)}
                    >
                      <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white/20 transition">
                        <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded font-mono">
                        {formatBytes(rec.size)}
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm truncate">{rec.class_name}</h3>
                        <p className="text-gray-500 text-xs truncate mt-0.5">{rec.topic_name}</p>
                        {rec.date && (
                          <p className="text-gray-400 text-xs mt-1">{rec.date} {rec.time && `at ${rec.time}`}</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openPlayer(rec)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          Play
                        </button>
                        <button
                          onClick={() => handleDownload(rec)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
