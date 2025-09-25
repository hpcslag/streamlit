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

export type WaveformState =
  | "idle"
  | "requesting_mic"
  | "recording"
  | "stopping"
  | "ready"
  | "playing"
  | "paused"
  | "error"

export type WaveformErrorCode =
  | "permission_denied"
  | "unsupported_browser"
  | "wavesurfer_unavailable"
  | "recorder_unavailable"
  | "encoder_failed"
  | "container_swap_blocked"
  | "unknown_error"

export type WaveformEventMap = {
  state: { prev: WaveformState; next: WaveformState }
  error: { code: WaveformErrorCode; message: string; error?: Error }
  ready: { wavBlob: Blob }
  duration: { ms: number }
  timeupdate: { currentTime: number }
  permissionDenied: Record<string, never>
}

export type WaveformControllerCapabilities = {
  canStartRecording: boolean
  canStopRecording: boolean
  canCancelRecording: boolean
  canPlay: boolean
  canPause: boolean
  canClear: boolean
}

export type WaveformControllerOptions = {
  sampleRate?: number
  autoLoadOnReady?: boolean
}

export interface WaveformController {
  startRecording(): Promise<void>
  stopRecording(): Promise<Blob>
  cancelRecording(): void

  load(source: Blob | ArrayBuffer | string): Promise<void>
  play(): Promise<void>
  pause(): void

  getState(): WaveformState
  getCapabilities(): WaveformControllerCapabilities
  getDurationMs(): number
  getCurrentTimeMs(): number

  mountVisualizer(el: HTMLElement): void
  unmountVisualizer(): void

  on<K extends keyof WaveformEventMap>(
    event: K,
    cb: (e: WaveformEventMap[K]) => void
  ): void
  off<K extends keyof WaveformEventMap>(
    event: K,
    cb: (e: WaveformEventMap[K]) => void
  ): void

  clear(): void
  destroy(): void
}
