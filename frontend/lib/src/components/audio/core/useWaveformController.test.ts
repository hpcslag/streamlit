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

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useWaveformController } from "./useWaveformController"

describe("useWaveformController", () => {
  let mockContainerRef: { current: HTMLDivElement | null }
  let mockEvents: {
    onPermissionDenied?: () => void
    onError?: (error: Error) => void
    onRecordStart?: () => void
    onRecordReady?: (blob: Blob) => void
    onApprove?: (wav: Blob) => void
    onCancel?: () => void
    onProgressMs?: (ms: number) => void
  }

  beforeEach(() => {
    mockContainerRef = { current: document.createElement("div") }
    mockEvents = {
      onPermissionDenied: vi.fn(),
      onError: vi.fn(),
      onRecordStart: vi.fn(),
      onRecordReady: vi.fn(),
      onApprove: vi.fn(),
      onCancel: vi.fn(),
      onProgressMs: vi.fn(),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("should initialize with idle state", () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    expect(result.current.state).toBe("idle")
  })

  it("should have playback methods", () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    expect(result.current.playback).toBeDefined()
    expect(typeof result.current.playback.isPlaying).toBe("function")
    expect(typeof result.current.playback.play).toBe("function")
    expect(typeof result.current.playback.pause).toBe("function")
    expect(typeof result.current.playback.getCurrentTimeMs).toBe("function")
    expect(typeof result.current.playback.getDurationMs).toBe("function")
  })

  it("should have control methods", () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    expect(typeof result.current.start).toBe("function")
    expect(typeof result.current.stop).toBe("function")
    expect(typeof result.current.approve).toBe("function")
    expect(typeof result.current.cancel).toBe("function")
    expect(typeof result.current.setEventHandlers).toBe("function")
  })

  it("should update events via setEventHandlers", () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    const newEvents = {
      onError: vi.fn(),
    }

    act(() => {
      result.current.setEventHandlers(newEvents)
    })

    expect(result.current).toBeDefined()
  })

  it("should call cancel and update state on cancel()", () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    act(() => {
      result.current.cancel()
    })

    expect(result.current.state).toBe("idle")
    expect(mockEvents.onCancel).toHaveBeenCalled()
  })

  it("should throw error when approving without recording", async () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    await expect(result.current.approve()).rejects.toThrow(
      "No recorded audio to approve"
    )
  })

  it("should return false for isPlaying when not playing", () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    expect(result.current.playback.isPlaying()).toBe(false)
  })

  it("should return 0 for getCurrentTimeMs when no playback", () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    expect(result.current.playback.getCurrentTimeMs()).toBe(0)
  })

  it("should return 0 for getDurationMs when no recording", () => {
    const { result } = renderHook(() =>
      useWaveformController({
        containerRef: mockContainerRef,
        events: mockEvents,
      })
    )

    expect(result.current.playback.getDurationMs()).toBe(0)
  })
})
