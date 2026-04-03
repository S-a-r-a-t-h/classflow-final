/**
 * useRecording.ts — Fixed recording hook.
 *
 * Fixes:
 *  1. Sends class_name + topic_name to /start so filenames are meaningful.
 *  2. Waits for MediaRecorder to fully stop before POSTing /stop (avoids
 *     truncated files).
 *  3. Returns the final filename so the room page can show a download link.
 */

import { useRef, useState, useCallback } from "react";
import api from "../utils/api";

interface StartOptions {
  className: string;
  topicName: string;
  roomId: string;
}

export function useRecording(getStream: () => MediaStream | null) {
  const [recording, setRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = useCallback(
    async ({ className = "Class", topicName = "Lecture", roomId = "" }: Partial<StartOptions> = {}) => {
      const stream = getStream();
      if (!stream) {
        alert("No local stream available to record.");
        return;
      }

      try {
        const res = await api.post("/api/rooms/recordings/start", {
          class_name: className,
          topic_name: topicName,
          room_id: roomId,
        });
        const { sessionId: sid, filename: fname } = res.data;
        setSessionId(sid);
        setFilename(fname);

        // Pick best supported MIME type
        const mimeType = [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
        ].find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 2_500_000,
        });
        recorderRef.current = recorder;

        recorder.ondataavailable = async (event) => {
          if (event.data?.size > 0) {
            try {
              await api.post(`/api/rooms/recordings/chunk/${sid}`, event.data, {
                headers: { "Content-Type": "application/octet-stream" },
              });
            } catch (err) {
              console.error("Chunk upload failed:", err);
            }
          }
        };

        recorder.start(2000); // chunk every 2 s for lower latency
        setRecording(true);
        return fname;
      } catch (err: any) {
        console.error("Failed to start recording:", err);
        alert(
          err?.response?.data?.detail ||
            "Failed to start recording. Make sure you are logged in as a teacher."
        );
      }
    },
    [getStream]
  );

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current || !sessionId) return null;

    // Wait for recorder to fully stop and fire its last ondataavailable
    await new Promise<void>((resolve) => {
      const rec = recorderRef.current!;
      rec.onstop = () => resolve();
      rec.stop();
    });

    recorderRef.current = null;
    setRecording(false);

    // Extra buffer for the last chunk to upload
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const res = await api.post(`/api/rooms/recordings/stop/${sessionId}`);
      setSessionId(null);
      return res.data as {
        filename: string;
        class_name: string;
        topic_name: string;
        timestamp: string;
        size: number;
      };
    } catch (err) {
      console.error("Failed to stop recording:", err);
      return null;
    }
  }, [sessionId]);

  return { recording, filename, startRecording, stopRecording };
}
