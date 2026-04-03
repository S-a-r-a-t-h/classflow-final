import { useEffect, useRef } from "react";

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  muted?: boolean;
  isLocal?: boolean;
  handRaised?: boolean;
  cameraOn?: boolean;
}

export default function VideoTile({
  stream,
  name,
  muted = false,
  isLocal = false,
  handRaised = false,
  cameraOn = true,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      // Only reassign if stream changed to avoid interrupting playback
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      // Explicitly call play() — required on Safari and after srcObject change
      video.play().catch((err) => {
        // AbortError is benign (play interrupted by another play call)
        if (err.name !== "AbortError") {
          console.warn("video.play() failed:", err);
        }
      });
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  // Also trigger play when the video element is ready
  const handleCanPlay = () => {
    const video = videoRef.current;
    if (video && video.paused && video.srcObject) {
      video.play().catch(() => {});
    }
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Show video only if stream has live, enabled video tracks AND cameraOn is true
  const hasLiveVideo =
    stream != null &&
    stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);
  const showVideo = hasLiveVideo && cameraOn;

  return (
    <div className="video-tile relative bg-gray-900 rounded-xl overflow-hidden border border-gray-700/50 shadow-lg">
      {/* Avatar shown when camera off */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
          <div className="w-16 h-16 rounded-full bg-blue-600/20 border-2 border-blue-500/40 flex items-center justify-center mb-2">
            <span className="text-blue-300 font-bold text-2xl">{initials}</span>
          </div>
          <span className="text-gray-400 text-xs">{isLocal ? "Your camera is off" : "Camera off"}</span>
        </div>
      )}

      {/* Video element — always in DOM so ref is stable */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || muted}
        onCanPlay={handleCanPlay}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          showVideo ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ aspectRatio: "16/9" }}
      />

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10">
        <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-md">
          {name}
          {isLocal && " (You)"}
        </span>
      </div>

      {/* Muted indicator */}
      {muted && !isLocal && (
        <div className="absolute bottom-2 right-2 z-10">
          <span className="bg-red-600/80 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Muted
          </span>
        </div>
      )}

      {/* Raised hand */}
      {handRaised && (
        <div className="absolute top-2 right-2 z-10">
          <span className="bg-yellow-500 text-black text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 3a2 2 0 00-2 2v6H5a2 2 0 00-2 2v1a5 5 0 005 5h4a5 5 0 005-5V9a2 2 0 00-2-2h-1V5a2 2 0 00-2-2H9z" />
            </svg>
            Hand raised
          </span>
        </div>
      )}

      {/* Local tag */}
      {isLocal && (
        <div className="absolute top-2 left-2 z-10">
          <span className="bg-blue-600/70 text-white text-xs px-2 py-0.5 rounded-md">You</span>
        </div>
      )}
    </div>
  );
}
