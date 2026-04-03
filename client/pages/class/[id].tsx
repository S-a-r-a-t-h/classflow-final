/**
 * /class/[id] — Student join page for shared class links.
 *
 * Teacher shares: http://<host>:3000/class/<classId>
 * Student opens link → sees class info → clicks Join → goes to /room/<classId>
 * If not logged in → redirected to /login?redirect=/class/<classId>
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../hooks/useAuth";
import api from "../../utils/api";

interface ClassInfo {
  id: string;
  name: string;
  subject: string;
  topic: string;
  teacherName: string;
  active: boolean;
}

export default function ClassJoinPage() {
  const router = useRouter();
  const { id: classId } = router.query as { id: string };
  const { user, loading } = useAuth();

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [fetching, setFetching] = useState(true);

  // Validate class exists (no auth required for this check)
  useEffect(() => {
    if (!classId) return;
    api
      .get(`/api/rooms/validate/${classId}`)
      .then((r) => {
        setClassInfo(r.data);
        setFetching(false);
      })
      .catch((err) => {
        setFetchError(
          err?.response?.status === 404
            ? "This class link is invalid or has expired."
            : "Unable to reach the server. Please check your connection."
        );
        setFetching(false);
      });
  }, [classId]);

  // If not logged in, redirect to login preserving the class link
  useEffect(() => {
    if (!loading && !user && classId) {
      router.push(`/login?redirect=/class/${classId}`);
    }
  }, [user, loading, classId, router]);

  const handleJoin = () => {
    router.push(`/room/${classId}`);
  };

  if (loading || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading class info...</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-gray-900 font-bold text-lg mb-2">Class Not Found</h2>
          <p className="text-gray-500 text-sm mb-6">{fetchError}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-xl transition text-sm"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <span className="text-xl font-bold text-gray-900">ClassFlow</span>
        </div>

        {/* Class card */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
          {/* Top band */}
          <div className="bg-blue-600 px-6 py-5">
            <p className="text-blue-100 text-xs font-medium uppercase tracking-wide mb-1">
              You were invited to join
            </p>
            <h1 className="text-white font-bold text-xl">{classInfo?.name}</h1>
            {classInfo?.subject && (
              <p className="text-blue-100 text-sm mt-0.5">{classInfo.subject}</p>
            )}
          </div>

          <div className="p-6 space-y-4">
            {/* Class details */}
            <div className="space-y-3">
              {classInfo?.topic && (
                <InfoRow
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  }
                  label="Topic"
                  value={classInfo.topic}
                />
              )}
              <InfoRow
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
                label="Teacher"
                value={classInfo?.teacherName || ""}
              />
              <InfoRow
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                label="Status"
                value={classInfo?.active ? "Live now" : "Not started yet"}
                valueClass={classInfo?.active ? "text-green-600 font-semibold" : "text-gray-500"}
              />
            </div>

            {/* Logged in as */}
            {user && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-gray-900 text-sm font-medium truncate">{user.name}</p>
                  <p className="text-gray-400 text-xs capitalize">{user.role}</p>
                </div>
              </div>
            )}

            {/* Join button */}
            <button
              onClick={handleJoin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Join Class
            </button>

            <Link
              href="/dashboard"
              className="block text-center text-sm text-gray-400 hover:text-gray-600 transition"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  valueClass = "text-gray-700",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <p className="text-gray-400 text-xs">{label}</p>
        <p className={`text-sm font-medium ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}
