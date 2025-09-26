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

import React, { memo, useEffect, useRef, useState } from "react"

import styled from "@emotion/styled"

import type { WaveformController } from "../core/types"

export interface WaveformSurfaceProps {
  controller: WaveformController
  showTimer?: boolean
  height?: number
  ariaLabel?: string
  className?: string
}

const StyledWaveformContainer = styled.div<{ $height: number }>(
  ({ $height, theme }) => ({
    position: "relative" as const,
    width: "100%",
    height: `${$height}px`,
    backgroundColor: theme.colors.secondaryBg,
    borderRadius: theme.radii.md,
    overflow: "hidden",
  })
)

const StyledWaveformDiv = styled.div({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
})

const StyledTimer = styled.div<{ $visible: boolean }>(
  ({ $visible, theme }) => ({
    position: "absolute" as const,
    bottom: "8px",
    right: "8px",
    fontSize: theme.fontSizes.sm,
    fontFamily: theme.fonts.mono,
    color: theme.colors.fadedText60,
    opacity: $visible ? 1 : 0,
    transition: "opacity 0.2s",
  })
)

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`
}

/**
 * Pure visual component for waveform visualization.
 * No buttons or controls - just the waveform surface and optional timer.
 */
const WaveformSurface: React.FC<WaveformSurfaceProps> = ({
  controller,
  showTimer = false,
  height = 56,
  ariaLabel,
  className,
}) => {
  const waveformRef = useRef<HTMLDivElement>(null)
  const [timerValue, setTimerValue] = useState("00:00")
  const [showTimerDisplay, setShowTimerDisplay] = useState(false)

  useEffect(() => {
    if (waveformRef.current) {
      controller.mountVisualizer(waveformRef.current)
    }

    return () => {
      controller.unmountVisualizer()
    }
  }, [controller])

  useEffect(() => {
    const updateTimer = (): void => {
      const state = controller.getState()
      let ms = 0

      if (state === "recording") {
        ms = controller.getDurationMs()
        setShowTimerDisplay(true)
      } else if (state === "playing") {
        ms = controller.getCurrentTimeMs()
        setShowTimerDisplay(true)
      } else if (state === "ready" || state === "paused") {
        ms = controller.getCurrentTimeMs()
        setShowTimerDisplay(true)
      } else {
        setShowTimerDisplay(false)
      }

      setTimerValue(formatTime(ms))
    }

    updateTimer()

    const handleDuration = (): void => updateTimer()
    const handleTimeUpdate = (): void => updateTimer()
    const handleStateChange = (): void => updateTimer()

    controller.on("duration", handleDuration)
    controller.on("timeupdate", handleTimeUpdate)
    controller.on("state", handleStateChange)

    return () => {
      controller.off("duration", handleDuration)
      controller.off("timeupdate", handleTimeUpdate)
      controller.off("state", handleStateChange)
    }
  }, [controller])

  return (
    <StyledWaveformContainer
      className={className}
      $height={height}
      aria-label={ariaLabel}
    >
      <StyledWaveformDiv ref={waveformRef} data-testid="waveform-surface" />
      {showTimer && (
        <StyledTimer $visible={showTimerDisplay} data-testid="waveform-timer">
          {timerValue}
        </StyledTimer>
      )}
    </StyledWaveformContainer>
  )
}

export default memo(WaveformSurface)
