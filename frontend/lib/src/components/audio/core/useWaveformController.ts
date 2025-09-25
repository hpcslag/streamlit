/**
 * Copyright (c) Streamlit Inc. (2018-2022) Snowflake Inc. (2022-2025)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import type WaveSurfer from "wavesurfer.js"

import { useEmotionTheme } from "~lib/hooks/useEmotionTheme"
import { blend, convertRemToPx } from "~lib/theme/utils"

import { WaveSurferPlayer } from "src/components/audio/backends/WaveSurferPlayer"
import { WaveSurferRecordBackend } from "src/components/audio/backends/WaveSurferRecordBackend"

import { encodeToWav } from "./encodeToWav"
import type {
  WaveformController,
  WaveformControllerCapabilities,
  WaveformControllerOptions,
  WaveformEventMap,
  WaveformState,
} from "./types"

const BAR_WIDTH = 3
const BAR_GAP = 1
const BAR_RADIUS = 2
const CURSOR_WIDTH = 0
const WAVEFORM_PADDING = 8

type EventListener<K extends keyof WaveformEventMap> = (
  event: WaveformEventMap[K]
) => void

/**
 * Hook that creates a headless waveform controller for recording and playback.
 * Manages WaveSurfer instance, state transitions, and event handling.
 * Always produces WAV 16kHz mono output.
 */
export function useWaveformController(
  options: WaveformControllerOptions = {}
): WaveformController {
  const theme = useEmotionTheme()
  const { sampleRate = 16000, autoLoadOnReady = true } = options

  const [state, setState] = useState<WaveformState>("idle")
  const [durationMs, setDurationMs] = useState(0)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)

  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const recordBackendRef = useRef<WaveSurferRecordBackend | null>(null)
  const playerRef = useRef<WaveSurferPlayer | null>(null)
  const eventListenersRef = useRef<
    Map<keyof WaveformEventMap, Set<EventListener<keyof WaveformEventMap>>>
  >(new Map())
  const containerRef = useRef<HTMLElement | null>(null)
  const pendingContainerSwapRef = useRef<HTMLElement | null>(null)
  const wavBlobRef = useRef<Blob | null>(null)

  const emit = useCallback(
    <K extends keyof WaveformEventMap>(
      event: K,
      data: WaveformEventMap[K]
    ): void => {
      const listeners = eventListenersRef.current.get(event)
      if (listeners) {
        listeners.forEach(listener => listener(data))
      }
    },
    []
  )

  const transitionTo = useCallback(
    (nextState: WaveformState): void => {
      const prevState = state
      setState(nextState)
      emit("state", { prev: prevState, next: nextState })
    },
    [state, emit]
  )

  const initializeWaveSurfer = useCallback(async (): Promise<void> => {
    try {
      const [WaveSurferModule, RecordPluginModule] = await Promise.all([
        import("wavesurfer.js"),
        import("wavesurfer.js/dist/plugins/record"),
      ])
      const WaveSurfer = WaveSurferModule.default
      const RecordPlugin = RecordPluginModule.default

      if (!containerRef.current) {
        throw new Error("No container mounted")
      }

      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: theme.colors.primary,
        progressColor: theme.colors.bodyText,
        height:
          convertRemToPx(theme.sizes.largestElementHeight) -
          2 * WAVEFORM_PADDING,
        barWidth: BAR_WIDTH,
        barGap: BAR_GAP,
        barRadius: BAR_RADIUS,
        cursorWidth: CURSOR_WIDTH,
        interact: true,
      })

      wavesurferRef.current = ws

      const recordBackend = new WaveSurferRecordBackend({ sampleRate })
      recordBackend.initialize(ws, RecordPlugin)
      recordBackend.setEventHandlers({
        onRecordProgress: ms => {
          setDurationMs(ms)
          emit("duration", { ms })
        },
        onPermissionDenied: () => {
          emit("permissionDenied", {})
        },
        onError: error => {
          transitionTo("error")
          emit("error", {
            code: "recorder_unavailable",
            message: "Recording failed",
            error,
          })
        },
      })
      recordBackendRef.current = recordBackend

      const player = new WaveSurferPlayer()
      player.initialize(ws)
      player.setEventHandlers({
        onTimeUpdate: ms => {
          setCurrentTimeMs(ms)
          emit("timeupdate", { currentTime: ms })
        },
        onReady: () => {
          setDurationMs(player.getDuration())
        },
      })
      playerRef.current = player
    } catch (error) {
      transitionTo("error")
      emit("error", {
        code: "wavesurfer_unavailable",
        message: "Failed to load WaveSurfer or Record plugin",
        error: error instanceof Error ? error : new Error(String(error)),
      })
      throw error
    }
  }, [theme, emit, sampleRate, transitionTo])

  const startRecording = useCallback(async (): Promise<void> => {
    if (state === "error") {
      throw new Error("Controller is in error state")
    }

    if (!wavesurferRef.current) {
      await initializeWaveSurfer()
    }

    if (state === "ready" || state === "paused") {
      // Clear will be called by user if needed before starting new recording
      transitionTo("idle")
      setDurationMs(0)
      setCurrentTimeMs(0)
    }

    transitionTo("requesting_mic")

    try {
      if (!recordBackendRef.current) {
        throw new Error("Record backend not initialized")
      }
      await recordBackendRef.current.startRecording()
      transitionTo("recording")
      setDurationMs(0)
      setCurrentTimeMs(0)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const isPermissionError = errorMessage.includes("permission")

      transitionTo("error")
      emit("error", {
        code: isPermissionError ? "permission_denied" : "recorder_unavailable",
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage),
      })

      if (isPermissionError) {
        emit("permissionDenied", {})
      }

      throw error
    }
  }, [state, transitionTo, initializeWaveSurfer, emit])

  const stopRecording = useCallback(async (): Promise<Blob> => {
    if (state !== "recording") {
      throw new Error("Not currently recording")
    }

    transitionTo("stopping")

    try {
      if (!recordBackendRef.current) {
        throw new Error("Record backend not initialized")
      }

      const rawBlob = await recordBackendRef.current.stopRecording()
      const wavBlob = await encodeToWav(rawBlob, sampleRate)
      wavBlobRef.current = wavBlob

      if (pendingContainerSwapRef.current) {
        const newContainer = pendingContainerSwapRef.current
        pendingContainerSwapRef.current = null
        try {
          wavesurferRef.current?.setOptions({ container: newContainer })
          containerRef.current = newContainer
        } catch {
          if (wavesurferRef.current) {
            wavesurferRef.current.destroy()
            wavesurferRef.current = null
            recordBackendRef.current?.destroy()
            recordBackendRef.current = null
            playerRef.current?.destroy()
            playerRef.current = null
          }
          await initializeWaveSurfer()
        }
      }

      if (autoLoadOnReady && playerRef.current) {
        await playerRef.current.load(wavBlob)
      }

      if (wavesurferRef.current) {
        wavesurferRef.current.setOptions({
          waveColor: blend(theme.colors.fadedText40, theme.colors.secondaryBg),
          progressColor: theme.colors.bodyText,
        })
      }

      transitionTo("ready")
      emit("ready", { wavBlob })
      return wavBlob
    } catch (error) {
      transitionTo("error")
      emit("error", {
        code: "encoder_failed",
        message: "Failed to encode audio",
        error: error instanceof Error ? error : new Error(String(error)),
      })
      throw error
    }
  }, [
    state,
    sampleRate,
    autoLoadOnReady,
    theme,
    transitionTo,
    emit,
    initializeWaveSurfer,
  ])

  const cancelRecording = useCallback((): void => {
    if (state === "recording" || state === "requesting_mic") {
      recordBackendRef.current?.cancelRecording()
      transitionTo("idle")
      setDurationMs(0)
      setCurrentTimeMs(0)
    }
  }, [state, transitionTo])

  const load = useCallback(
    async (source: Blob | ArrayBuffer | string): Promise<void> => {
      if (state === "error") {
        throw new Error("Controller is in error state")
      }

      if (!wavesurferRef.current) {
        await initializeWaveSurfer()
      }

      if (!playerRef.current) {
        throw new Error("Player not initialized")
      }

      await playerRef.current.load(source)

      if (wavesurferRef.current) {
        wavesurferRef.current.setOptions({
          waveColor: blend(theme.colors.fadedText40, theme.colors.secondaryBg),
          progressColor: theme.colors.bodyText,
        })
      }

      transitionTo("ready")
      setDurationMs(playerRef.current.getDuration())
    },
    [state, theme, transitionTo, initializeWaveSurfer]
  )

  const play = useCallback(async (): Promise<void> => {
    if (state !== "ready" && state !== "paused") {
      throw new Error(`Cannot play in state: ${state}`)
    }

    if (!playerRef.current) {
      throw new Error("Player not initialized")
    }

    await playerRef.current.play()
    transitionTo("playing")
  }, [state, transitionTo])

  const pause = useCallback((): void => {
    if (state !== "playing") return
    playerRef.current?.pause()
    transitionTo("paused")
  }, [state, transitionTo])

  const clear = useCallback((): void => {
    if (state === "recording") {
      recordBackendRef.current?.cancelRecording()
    }
    playerRef.current?.destroy()
    playerRef.current = new WaveSurferPlayer()
    if (wavesurferRef.current) {
      playerRef.current.initialize(wavesurferRef.current)
      playerRef.current.setEventHandlers({
        onTimeUpdate: ms => {
          setCurrentTimeMs(ms)
          emit("timeupdate", { currentTime: ms })
        },
        onReady: () => {
          setDurationMs(playerRef.current?.getDuration() || 0)
        },
      })
      wavesurferRef.current.empty()
      wavesurferRef.current.setOptions({
        waveColor: theme.colors.primary,
      })
    }
    wavBlobRef.current = null
    transitionTo("idle")
    setDurationMs(0)
    setCurrentTimeMs(0)
  }, [state, theme, transitionTo, emit])

  const mountVisualizer = useCallback(
    (el: HTMLElement): void => {
      if (state === "recording") {
        pendingContainerSwapRef.current = el
        return
      }

      if (el === containerRef.current) return

      containerRef.current = el

      if (!wavesurferRef.current) {
        void initializeWaveSurfer()
      } else {
        try {
          wavesurferRef.current.setOptions({ container: el })
        } catch {
          wavesurferRef.current.destroy()
          wavesurferRef.current = null
          recordBackendRef.current?.destroy()
          recordBackendRef.current = null
          playerRef.current?.destroy()
          playerRef.current = null
          void initializeWaveSurfer()
        }
      }
    },
    [state, initializeWaveSurfer]
  )

  const unmountVisualizer = useCallback((): void => {
    containerRef.current = null
    pendingContainerSwapRef.current = null
  }, [])

  const getCapabilities = useCallback((): WaveformControllerCapabilities => {
    return {
      canStartRecording:
        state === "idle" || state === "ready" || state === "paused",
      canStopRecording: state === "recording",
      canCancelRecording: state === "recording" || state === "requesting_mic",
      canPlay: state === "ready" || state === "paused",
      canPause: state === "playing",
      canClear: state === "ready" || state === "paused",
    }
  }, [state])

  const on = useCallback(
    <K extends keyof WaveformEventMap>(
      event: K,
      cb: EventListener<K>
    ): void => {
      if (!eventListenersRef.current.has(event)) {
        eventListenersRef.current.set(event, new Set())
      }
      eventListenersRef.current.get(event)?.add(cb)
    },
    []
  )

  const off = useCallback(
    <K extends keyof WaveformEventMap>(
      event: K,
      cb: EventListener<K>
    ): void => {
      eventListenersRef.current.get(event)?.delete(cb)
    },
    []
  )

  const destroy = useCallback((): void => {
    recordBackendRef.current?.destroy()
    playerRef.current?.destroy()
    wavesurferRef.current?.destroy()
    recordBackendRef.current = null
    playerRef.current = null
    wavesurferRef.current = null
    containerRef.current = null
    pendingContainerSwapRef.current = null
    eventListenersRef.current.clear()
    wavBlobRef.current = null
    setState("idle")
    setDurationMs(0)
    setCurrentTimeMs(0)
  }, [])

  useEffect(() => {
    return () => {
      destroy()
    }
  }, [destroy])

  const controller: WaveformController = {
    startRecording,
    stopRecording,
    cancelRecording,
    load,
    play,
    pause,
    getState: () => state,
    getCapabilities,
    getDurationMs: () => durationMs,
    getCurrentTimeMs: () => currentTimeMs,
    mountVisualizer,
    unmountVisualizer,
    on,
    off,
    clear,
    destroy,
  }

  return controller
}
