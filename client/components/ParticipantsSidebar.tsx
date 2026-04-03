import { Participant } from "../hooks/useWebRTC";

interface ParticipantsSidebarProps {
  participants: Participant[];
  myName: string;
  myRole: string;
  onMuteUser?: (userId: string, muted: boolean) => void;
  onClose?: () => void;
}

export default function ParticipantsSidebar({
  participants,
  myName,
  myRole,
  onMuteUser,
  onClose,
}: ParticipantsSidebarProps) {
  const total = participants.length + 1;

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-gray-900 font-semibold text-sm">Participants</h3>
          <span className="bg-blue-100 text-blue-700 text-xs font-medium px-1.5 py-0.5 rounded-full">
            {total}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* You */}
        <ParticipantRow
          name={myName}
          role={myRole}
          isSelf
          muted={false}
          handRaised={false}
        />

        {participants.length > 0 && (
          <div className="my-2 border-t border-gray-100" />
        )}

        {/* Others */}
        {participants.map((p) => (
          <ParticipantRow
            key={p.userId}
            name={p.name}
            role={p.role}
            muted={p.muted}
            handRaised={p.handRaised}
            canMute={myRole === "teacher" && !!onMuteUser}
            onToggleMute={() => onMuteUser?.(p.userId, !p.muted)}
          />
        ))}

        {participants.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-xs">No other participants</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantRow({
  name,
  role,
  isSelf,
  muted,
  handRaised,
  canMute,
  onToggleMute,
}: {
  name: string;
  role: string;
  isSelf?: boolean;
  muted: boolean;
  handRaised: boolean;
  canMute?: boolean;
  onToggleMute?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-50 group transition">
      <div className="relative flex-shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
            role === "teacher"
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        {handRaised && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 3a2 2 0 00-2 2v5H5a2 2 0 000 4h5a2 2 0 002-2V5a2 2 0 00-2-2z" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-gray-900 text-sm font-medium truncate">
          {name}
          {isSelf && <span className="text-gray-400 font-normal"> (You)</span>}
        </p>
        <p className="text-gray-400 text-xs capitalize">{role}</p>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {muted && !isSelf && (
          <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {canMute && onToggleMute && (
          <button
            onClick={onToggleMute}
            className="opacity-0 group-hover:opacity-100 text-xs text-gray-500 hover:text-red-600 bg-gray-100 hover:bg-red-50 border border-gray-200 px-2 py-0.5 rounded transition"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        )}
      </div>
    </div>
  );
}
