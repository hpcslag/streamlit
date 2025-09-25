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

import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useWaveformController } from "./useWaveformController"

vi.mock("wavesurfer.js", () => ({
  default: {
    create: vi.fn(() => ({
      on: vi.fn(),
      off: vi.fn(),
      destroy: vi.fn(),
      empty: vi.fn(),
      setOptions: vi.fn(),
      registerPlugin: vi.fn(() => ({
        on: vi.fn(),
        off: vi.fn(),
        destroy: vi.fn(),
        startRecording: vi.fn(),
        stopRecording: vi.fn(),
        isRecording: vi.fn(() => false),
      })),
    })),
  },
}))

vi.mock("wavesurfer.js/dist/plugins/record", () => ({
  default: {
    create: vi.fn(() => ({
      on: vi.fn(),
      off: vi.fn(),
      destroy: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      isRecording: vi.fn(() => false),
    })),
  },
}))

describe("useWaveformController", () => {
  it("initializes with idle state", () => {
    const { result } = renderHook(() => useWaveformController())

    expect(result.current.getState()).toBe("idle")
    expect(result.current.getDurationMs()).toBe(0)
    expect(result.current.getCurrentTimeMs()).toBe(0)
  })

  it("provides correct capabilities for idle state", () => {
    const { result } = renderHook(() => useWaveformController())

    const capabilities = result.current.getCapabilities()
    expect(capabilities).toEqual({
      canStartRecording: true,
      canStopRecording: false,
      canCancelRecording: false,
      canPlay: false,
      canPause: false,
      canClear: false,
    })
  })

  it("provides correct capabilities for ready state", () => {
    const { result } = renderHook(() => useWaveformController())

    const controller = result.current
    vi.spyOn(controller, "getState").mockReturnValue("ready")

    const capabilities = controller.getCapabilities()
    expect(capabilities.canStartRecording).toBe(true)
    expect(capabilities.canStopRecording).toBe(false)
    expect(capabilities.canPlay).toBe(true)
    expect(capabilities.canClear).toBe(true)
  })

  it("provides correct capabilities for recording state", () => {
    const { result } = renderHook(() => useWaveformController())

    const controller = result.current
    vi.spyOn(controller, "getState").mockReturnValue("recording")

    const capabilities = controller.getCapabilities()
    expect(capabilities.canStartRecording).toBe(false)
    expect(capabilities.canStopRecording).toBe(true)
    expect(capabilities.canCancelRecording).toBe(true)
    expect(capabilities.canPlay).toBe(false)
  })

  it("provides correct capabilities for playing state", () => {
    const { result } = renderHook(() => useWaveformController())

    const controller = result.current
    vi.spyOn(controller, "getState").mockReturnValue("playing")

    const capabilities = controller.getCapabilities()
    expect(capabilities.canStartRecording).toBe(false)
    expect(capabilities.canPause).toBe(true)
    expect(capabilities.canPlay).toBe(false)
  })

  it("allows registering and removing event listeners", () => {
    const { result } = renderHook(() => useWaveformController())
    const controller = result.current

    const mockCallback = vi.fn()
    controller.on("state", mockCallback)
    controller.off("state", mockCallback)

    expect(mockCallback).not.toHaveBeenCalled()
  })

  it("accepts custom sample rate option", () => {
    const { result } = renderHook(() =>
      useWaveformController({ sampleRate: 48000 })
    )

    expect(result.current).toBeDefined()
  })

  it("accepts autoLoadOnReady option", () => {
    const { result } = renderHook(() =>
      useWaveformController({ autoLoadOnReady: false })
    )

    expect(result.current).toBeDefined()
  })

  it("cleans up on unmount", () => {
    const { result, unmount } = renderHook(() => useWaveformController())

    const controller = result.current
    const destroySpy = vi.spyOn(controller, "destroy")

    unmount()

    expect(destroySpy).toHaveBeenCalled()
  })
})
