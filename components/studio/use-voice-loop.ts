"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// listening: waiting for you · hearing: you're talking · thinking: stylist is working · speaking: stylist is talking
export type VoiceState = "off" | "listening" | "hearing" | "thinking" | "speaking";

const TICK_MS = 40;
const ONSET_MS = 120; // sustained sound before we count it as speech
const END_SILENCE_MS = 900; // pause that ends your turn
const MIN_SPEECH_MS = 350; // shorter blips (coughs, clicks) are dropped
const MAX_TURN_MS = 30_000;
const IDLE_RESTART_MS = 8_000; // keep the pre-roll recording short while nobody talks
const BARGE_IN_MS = 250; // talk over the stylist for this long to interrupt

const recorderType = () =>
  ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

// Hands-free conversation: the mic stays open, a simple energy VAD finds your turns,
// and you can interrupt the stylist by talking over it. Speech-to-text and text-to-speech
// run server-side through AI Gateway (/api/voice/*).
export function useVoiceLoop({ onUtterance }: { onUtterance: (audio: Blob) => void }) {
  const [state, setStateRaw] = useState<VoiceState>("off");
  const [level, setLevel] = useState(0); // 0-1 mic level, for the orb
  const stateRef = useRef<VoiceState>("off");
  const onUtteranceRef = useRef(onUtterance);
  useEffect(() => {
    onUtteranceRef.current = onUtterance;
  }, [onUtterance]);

  const r = useRef({
    stream: null as MediaStream | null,
    ctx: null as AudioContext | null,
    analyser: null as AnalyserNode | null,
    timer: 0 as ReturnType<typeof setInterval> | 0,
    recorder: null as MediaRecorder | null,
    chunks: [] as Blob[],
    recStartedAt: 0,
    aboveSince: 0,
    speechStart: 0,
    lastVoice: 0,
    floor: 0.01,
    audio: null as HTMLAudioElement | null,
    speakAbort: null as AbortController | null,
  });

  const setState = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setStateRaw(s);
  }, []);

  // Recording starts when we begin listening (not at speech onset) so the first syllable isn't clipped.
  const startRecorder = useCallback(() => {
    const v = r.current;
    if (!v.stream) return;
    if (v.recorder?.state === "recording") v.recorder.stop();
    const rec = new MediaRecorder(v.stream, { mimeType: recorderType() || undefined });
    v.chunks = [];
    rec.ondataavailable = (e) => e.data.size && v.chunks.push(e.data);
    rec.start();
    v.recorder = rec;
    v.recStartedAt = performance.now();
  }, []);

  const finishRecorder = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        const rec = r.current.recorder;
        if (!rec || rec.state !== "recording") return resolve(new Blob());
        rec.onstop = () => resolve(new Blob(r.current.chunks, { type: rec.mimeType }));
        rec.stop();
      }),
    [],
  );

  const stopPlayback = useCallback(() => {
    const v = r.current;
    v.speakAbort?.abort();
    if (v.audio) {
      v.audio.pause();
      v.audio.src = "";
      v.audio = null;
    }
  }, []);

  const listen = useCallback(() => {
    if (stateRef.current === "off") return;
    startRecorder();
    r.current.aboveSince = 0;
    setState("listening");
  }, [setState, startRecorder]);

  const tick = useCallback(() => {
    const v = r.current;
    if (!v.analyser) return;
    const buf = new Float32Array(v.analyser.fftSize);
    v.analyser.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((a, x) => a + x * x, 0) / buf.length);
    const now = performance.now();
    const s = stateRef.current;

    // Track the room's noise floor while nobody is talking.
    if (s === "listening") v.floor = v.floor * 0.97 + Math.min(rms, 0.05) * 0.03;
    const threshold = Math.max(0.018, v.floor * 3);
    setLevel(Math.min(1, rms / 0.15));

    if (s === "listening") {
      if (rms > threshold) {
        v.aboveSince ||= now;
        if (now - v.aboveSince > ONSET_MS) {
          v.speechStart = v.aboveSince;
          v.lastVoice = now;
          setState("hearing");
        }
      } else {
        v.aboveSince = 0;
        if (now - v.recStartedAt > IDLE_RESTART_MS) startRecorder();
      }
    } else if (s === "hearing") {
      if (rms > threshold * 0.7) v.lastVoice = now;
      const ended = now - v.lastVoice > END_SILENCE_MS || now - v.speechStart > MAX_TURN_MS;
      if (ended) {
        const spoke = v.lastVoice - v.speechStart;
        if (spoke < MIN_SPEECH_MS) return listen();
        setState("thinking");
        finishRecorder().then((blob) => onUtteranceRef.current(blob));
      }
    } else if (s === "speaking") {
      // Echo cancellation removes most of our own playback; require a clearly louder voice to barge in.
      if (rms > Math.max(0.06, threshold * 2.5)) {
        v.aboveSince ||= now;
        if (now - v.aboveSince > BARGE_IN_MS) {
          stopPlayback();
          startRecorder();
          v.speechStart = v.aboveSince;
          v.lastVoice = now;
          setState("hearing");
        }
      } else v.aboveSince = 0;
    }
  }, [finishRecorder, listen, setState, startRecorder, stopPlayback]);

  const start = useCallback(async () => {
    if (stateRef.current !== "off") return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    Object.assign(r.current, { stream, ctx, analyser, floor: 0.01 });
    r.current.timer = setInterval(tick, TICK_MS);
    stateRef.current = "listening"; // so listen() doesn't bail
    listen();
  }, [listen, tick]);

  const stop = useCallback(() => {
    const v = r.current;
    if (v.timer) clearInterval(v.timer);
    stopPlayback();
    if (v.recorder?.state === "recording") v.recorder.stop();
    v.stream?.getTracks().forEach((t) => t.stop());
    v.ctx?.close();
    Object.assign(v, { stream: null, ctx: null, analyser: null, timer: 0, recorder: null });
    setLevel(0);
    setState("off");
  }, [setState, stopPlayback]);

  // Speak a reply, then go back to listening. Talking over it interrupts (see tick).
  const say = useCallback(
    async (text: string) => {
      if (stateRef.current === "off") return;
      const v = r.current;
      if (!text.trim()) return listen();
      stopPlayback();
      const ctrl = new AbortController();
      v.speakAbort = ctrl;
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("speak failed");
        const url = URL.createObjectURL(await res.blob());
        if (ctrl.signal.aborted || (stateRef.current as VoiceState) === "off") return;
        const audio = new Audio(url);
        v.audio = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (v.audio === audio) {
            v.audio = null;
            listen();
          }
        };
        v.aboveSince = 0;
        setState("speaking");
        await audio.play();
      } catch {
        if (!ctrl.signal.aborted) listen();
      }
    },
    [listen, setState, stopPlayback],
  );

  useEffect(() => stop, [stop]);

  return { state, level, start, stop, say, listen };
}
