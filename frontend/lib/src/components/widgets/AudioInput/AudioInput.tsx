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

import React, {
  memo,
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import { Delete, FileDownload } from "@emotion-icons/material-outlined"

import { AudioInput as AudioInputProto } from "@streamlit/protobuf"

import { useWaveformController, WaveformSurface } from "~lib/components/audio"
import Toolbar, { ToolbarAction } from "~lib/components/shared/Toolbar"
import { Placement } from "~lib/components/shared/Tooltip"
import TooltipIcon from "~lib/components/shared/TooltipIcon"
import { WidgetLabel } from "~lib/components/widgets/BaseWidget"
import { FormClearHelper } from "~lib/components/widgets/Form"
import { FileUploadClient } from "~lib/FileUploadClient"
import useDownloadUrl from "~lib/hooks/useDownloadUrl"
import useWidgetManagerElementState from "~lib/hooks/useWidgetManagerElementState"
import { uploadFiles } from "~lib/util/uploadFiles"
import {
  isNullOrUndefined,
  labelVisibilityProtoValueToEnum,
  notNullOrUndefined,
} from "~lib/util/utils"
import { WidgetStateManager } from "~lib/WidgetStateManager"

import AudioInputActionButtons from "./AudioInputActionButtons"
import AudioInputErrorState from "./AudioInputErrorState"
import { STARTING_TIME_STRING } from "./constants"
import formatTime from "./formatTime"
import NoMicPermissions from "./NoMicPermissions"
import Placeholder from "./Placeholder"
import {
  StyledAudioInputContainerDiv,
  StyledWaveformContainerDiv,
  StyledWaveformInnerDiv,
  StyledWaveformTimeCode,
  StyledWaveSurferDiv,
  StyledWidgetLabelHelp,
} from "./styled-components"

export interface Props {
  element: AudioInputProto
  uploadClient: FileUploadClient
  widgetMgr: WidgetStateManager
  fragmentId?: string
  disabled: boolean
}

const AudioInput: React.FC<Props> = ({
  element,
  uploadClient,
  widgetMgr,
  fragmentId,
  disabled,
}): ReactElement => {
  const targetSampleRate = element.sampleRate || 16000

  const controller = useWaveformController({
    sampleRate: targetSampleRate,
    autoLoadOnReady: true,
  })

  const [deleteFileUrl, setDeleteFileUrl] = useWidgetManagerElementState<
    string | null
  >({
    widgetMgr,
    id: element.id,
    key: "deleteFileUrl",
    defaultValue: null,
  })

  const [recordingUrl, setRecordingUrl] = useWidgetManagerElementState<
    string | null
  >({
    widgetMgr,
    id: element.id,
    key: "recordingUrl",
    defaultValue: null,
  })

  const [recordingTime, setRecordingTime] =
    useWidgetManagerElementState<string>({
      widgetMgr,
      id: element.id,
      formId: element.formId,
      key: "recordingTime",
      defaultValue: STARTING_TIME_STRING,
    })

  const [progressTime, setProgressTime] = useState(STARTING_TIME_STRING)
  const [shouldUpdatePlaybackTime, setShouldUpdatePlaybackTime] =
    useState(false)
  const [hasNoMicPermissions, setHasNoMicPermissions] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isError, setIsError] = useState(false)

  const uploadAbortControllerRef = useRef<AbortController | null>(null)
  const currentBlobUrlRef = useRef<string | null>(null)

  const widgetId = element.id
  const widgetFormId = element.formId

  const transcodeAndUploadFile = useCallback(
    async (wavBlob: Blob) => {
      if (uploadAbortControllerRef.current) {
        uploadAbortControllerRef.current.abort()
      }

      const abortController = new AbortController()
      uploadAbortControllerRef.current = abortController

      try {
        setIsUploading(true)
        if (notNullOrUndefined(widgetFormId))
          widgetMgr.setFormsWithUploadsInProgress(new Set([widgetFormId]))

        if (abortController.signal.aborted) {
          return
        }

        let blobUrl: string
        try {
          blobUrl = URL.createObjectURL(wavBlob)
          if (
            currentBlobUrlRef.current &&
            currentBlobUrlRef.current !== blobUrl
          ) {
            URL.revokeObjectURL(currentBlobUrlRef.current)
          }
          currentBlobUrlRef.current = blobUrl
        } catch {
          setIsError(true)
          setIsUploading(false)
          if (notNullOrUndefined(widgetFormId))
            widgetMgr.setFormsWithUploadsInProgress(new Set())
          return
        }

        if (abortController.signal.aborted) {
          URL.revokeObjectURL(blobUrl)
          currentBlobUrlRef.current = null
          return
        }

        setRecordingUrl(blobUrl)

        const timestamp = new Date()
          .toISOString()
          .slice(0, 16)
          .replace(/:/g, "-")
        const file = new File([wavBlob], `${timestamp}_audio.wav`, {
          type: wavBlob.type,
        })

        try {
          const { successfulUploads, failedUploads } = await uploadFiles({
            files: [file],
            uploadClient,
            widgetMgr,
            widgetInfo: { id: widgetId, formId: widgetFormId },
            fragmentId,
            signal: abortController.signal,
          })

          if (abortController.signal.aborted) {
            return
          }

          if (failedUploads.length > 0) {
            setIsError(true)
            return
          }

          setIsError(false)
          const upload = successfulUploads[0]
          if (upload?.fileUrl?.deleteUrl) {
            setDeleteFileUrl(upload.fileUrl.deleteUrl)
          }
        } catch {
          if (!abortController.signal.aborted) {
            setIsError(true)
          }
        } finally {
          if (notNullOrUndefined(widgetFormId))
            widgetMgr.setFormsWithUploadsInProgress(new Set())
          if (!abortController.signal.aborted) {
            setIsUploading(false)
          }
        }
      } catch {
        if (!abortController.signal.aborted) {
          setIsError(true)
          setIsUploading(false)
        }
        if (notNullOrUndefined(widgetFormId))
          widgetMgr.setFormsWithUploadsInProgress(new Set())
      }
    },
    [
      uploadClient,
      widgetMgr,
      widgetId,
      widgetFormId,
      fragmentId,
      setDeleteFileUrl,
      setRecordingUrl,
    ]
  )

  const handleClear = useCallback(
    async ({
      updateWidgetManager,
      deleteFile,
    }: {
      updateWidgetManager: boolean
      deleteFile: boolean
    }): Promise<void> => {
      const urlToRevoke = recordingUrl

      if (urlToRevoke && currentBlobUrlRef.current === urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke)
        currentBlobUrlRef.current = null
      }

      setRecordingUrl(null)
      setDeleteFileUrl(null)
      setProgressTime(STARTING_TIME_STRING)
      setRecordingTime(STARTING_TIME_STRING)
      setShouldUpdatePlaybackTime(false)

      controller.clear()

      if (updateWidgetManager) {
        widgetMgr.setFileUploaderStateValue(
          element,
          {},
          { fromUi: true },
          fragmentId
        )
      }

      if (deleteFile && deleteFileUrl) {
        try {
          await uploadClient.deleteFile(deleteFileUrl)
        } catch {
          // Silently handle deletion errors
        }
      }

      if (notNullOrUndefined(urlToRevoke)) {
        URL.revokeObjectURL(urlToRevoke)
      }
    },
    [
      deleteFileUrl,
      recordingUrl,
      uploadClient,
      controller,
      element,
      widgetMgr,
      fragmentId,
      setRecordingTime,
      setDeleteFileUrl,
      setRecordingUrl,
    ]
  )

  useEffect(() => {
    const handlePermissionDenied = (): void => {
      setHasNoMicPermissions(true)
    }

    const handleError = (): void => {
      setIsError(true)
    }

    const handleReady = ({ wavBlob }: { wavBlob: Blob }): void => {
      void transcodeAndUploadFile(wavBlob)
    }

    const handleDuration = ({ ms }: { ms: number }): void => {
      setRecordingTime(formatTime(ms))
    }

    const handleTimeUpdate = ({
      currentTime,
    }: {
      currentTime: number
    }): void => {
      setProgressTime(formatTime(currentTime))
    }

    controller.on("permissionDenied", handlePermissionDenied)
    controller.on("error", handleError)
    controller.on("ready", handleReady)
    controller.on("duration", handleDuration)
    controller.on("timeupdate", handleTimeUpdate)

    return () => {
      controller.off("permissionDenied", handlePermissionDenied)
      controller.off("error", handleError)
      controller.off("ready", handleReady)
      controller.off("duration", handleDuration)
      controller.off("timeupdate", handleTimeUpdate)
    }
  }, [controller, transcodeAndUploadFile, setRecordingTime])

  useEffect(() => {
    if (isNullOrUndefined(widgetFormId)) return

    const formClearHelper = new FormClearHelper()
    formClearHelper.manageFormClearListener(widgetMgr, widgetFormId, () => {
      void handleClear({ updateWidgetManager: true, deleteFile: false })
    })

    return () => formClearHelper.disconnect()
  }, [widgetFormId, handleClear, widgetMgr])

  useEffect(() => {
    if (recordingUrl && controller.getState() === "idle") {
      void controller.load(recordingUrl)
    }
  }, [recordingUrl, controller])

  useEffect(() => {
    return () => {
      if (uploadAbortControllerRef.current) {
        uploadAbortControllerRef.current.abort()
        uploadAbortControllerRef.current = null
      }
      controller.destroy()
    }
  }, [controller])

  const onClickPlayPause = useCallback(async () => {
    const state = controller.getState()
    try {
      if (state === "playing") {
        controller.pause()
      } else if (state === "ready" || state === "paused") {
        await controller.play()
        setShouldUpdatePlaybackTime(true)
      }
    } catch {
      setIsError(true)
    }
  }, [controller])

  const startRecording = useCallback(async () => {
    if (recordingUrl) {
      await handleClear({ updateWidgetManager: false, deleteFile: true })
    }

    try {
      await controller.startRecording()
      setRecordingTime(STARTING_TIME_STRING)
    } catch {
      // Error handling is done via event listeners
    }
  }, [controller, recordingUrl, handleClear, setRecordingTime])

  const stopRecording = useCallback(async () => {
    try {
      await controller.stopRecording()
    } catch {
      setIsError(true)
    }
  }, [controller])

  const downloadRecording = useDownloadUrl(recordingUrl, "recording.wav")

  const handleStartRecording = useCallback(() => {
    void startRecording()
  }, [startRecording])

  const handleStopRecording = useCallback(() => {
    void stopRecording()
  }, [stopRecording])

  const handleClearWithError = useCallback(() => {
    void handleClear({ updateWidgetManager: false, deleteFile: true })
    setIsError(false)
  }, [handleClear])

  const handleDownloadClick = useCallback(() => {
    downloadRecording()
  }, [downloadRecording])

  const handleDeleteClick = useCallback(() => {
    void handleClear({
      updateWidgetManager: true,
      deleteFile: true,
    })
  }, [handleClear])

  const state = controller.getState()
  const isRecording = state === "recording"
  const isPlaying = state === "playing"
  const showPlaceholder = state === "idle" && !hasNoMicPermissions
  const showNoMicPermissionsOrPlaceholderOrError =
    hasNoMicPermissions || showPlaceholder || isError

  return (
    <StyledAudioInputContainerDiv
      className="stAudioInput"
      data-testid="stAudioInput"
    >
      <WidgetLabel
        label={element.label}
        disabled={disabled}
        labelVisibility={labelVisibilityProtoValueToEnum(
          element.labelVisibility?.value
        )}
      >
        {element.help && (
          <StyledWidgetLabelHelp>
            <TooltipIcon content={element.help} placement={Placement.TOP} />
          </StyledWidgetLabelHelp>
        )}
      </WidgetLabel>
      <StyledWaveformContainerDiv disabled={disabled}>
        <Toolbar
          isFullScreen={false}
          disableFullscreenMode={true}
          target={StyledWaveformContainerDiv}
        >
          {recordingUrl && (
            <ToolbarAction
              label="Download as WAV"
              icon={FileDownload}
              onClick={handleDownloadClick}
            />
          )}
          {deleteFileUrl && (
            <ToolbarAction
              label="Clear recording"
              icon={Delete}
              onClick={handleDeleteClick}
            />
          )}
        </Toolbar>
        <AudioInputActionButtons
          isRecording={isRecording}
          isPlaying={isPlaying}
          isUploading={isUploading}
          isError={isError}
          recordingUrlExists={Boolean(recordingUrl)}
          startRecording={handleStartRecording}
          stopRecording={handleStopRecording}
          onClickPlayPause={() => void onClickPlayPause()}
          onClear={handleClearWithError}
          disabled={disabled || hasNoMicPermissions}
        />
        <StyledWaveformInnerDiv>
          {isError && <AudioInputErrorState />}
          {showPlaceholder && <Placeholder />}
          {hasNoMicPermissions && <NoMicPermissions />}
          <StyledWaveSurferDiv
            data-testid="stAudioInputWaveSurfer"
            show={!showNoMicPermissionsOrPlaceholderOrError}
          >
            <WaveformSurface
              controller={controller}
              showTimer={false}
              height={48}
            />
          </StyledWaveSurferDiv>
        </StyledWaveformInnerDiv>
        <StyledWaveformTimeCode
          isPlayingOrRecording={isRecording || isPlaying}
          disabled={disabled}
          data-testid="stAudioInputWaveformTimeCode"
        >
          {shouldUpdatePlaybackTime ? progressTime : recordingTime}
        </StyledWaveformTimeCode>
      </StyledWaveformContainerDiv>
    </StyledAudioInputContainerDiv>
  )
}

export default memo(AudioInput)
