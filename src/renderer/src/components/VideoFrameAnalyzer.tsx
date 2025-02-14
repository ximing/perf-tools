import React, { useState, useEffect, useRef } from 'react'
import { Upload, Button, Space, message, Image } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import './video.css'

interface FrameInfo {
  path: string
  timestamp: number
  index: number
}

declare global {
  interface Window {
    electronAPI: {
      processVideo: (path: string) => Promise<FrameInfo[]>
      cleanupFrames: () => Promise<void>
      onProgress: (callback: (progress: number) => void) => void
      removeProgressListener: () => void
    }
  }
}

const { Dragger } = Upload

const VideoFrameAnalyzer: React.FC = () => {
  const [frames, setFrames] = useState<FrameInfo[]>([])
  const [startFrame, setStartFrame] = useState<FrameInfo | null>(null)
  const [endFrame, setEndFrame] = useState<FrameInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentFrame, setCurrentFrame] = useState<FrameInfo | null>(null)
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const framesContainerRef = useRef<HTMLDivElement>(null)
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false)

  useEffect(() => {
    // 设置进度监听器
    window.electronAPI.onProgress((progress) => {
      setProgress(progress)
    })

    // 清理函数
    return () => {
      window.electronAPI.removeProgressListener()
    }
  }, [])

  const processVideo = async (file: File) => {
    try {
      setLoading(true)
      setProgress(0)
      const frames = await window.electronAPI.processVideo(file.path)
      setFrames(frames)
      setCurrentFrame(frames[0])
      message.success('视频帧提取完成')
    } catch (error) {
      message.error('处理视频时出错')
      console.error(error)
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  const handleFrameClick = (frame: FrameInfo) => {
    if (!startFrame) {
      setStartFrame(frame)
    } else if (!endFrame) {
      if (frame.index < startFrame.index) {
        setStartFrame(frame)
      } else {
        setEndFrame(frame)
      }
    } else {
      setStartFrame(frame)
      setEndFrame(null)
    }
  }

  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = milliseconds / 1000
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const ms = Math.floor((totalSeconds % 1) * 1000)
    return `${minutes}:${seconds}.${ms}`
  }

  const getDuration = () => {
    if (startFrame && endFrame) {
      const duration = endFrame.timestamp - startFrame.timestamp
      return parseInt(duration.toFixed(0))
    }
    return ''
  }

  const handleReset = async () => {
    setFrames([])
    setStartFrame(null)
    setEndFrame(null)
    await window.electronAPI.cleanupFrames()
  }

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: 'video/mp4',
    showUploadList: false,
    beforeUpload: (file) => {
      processVideo(file)
      return false
    }
  }

  // 处理时间轴点击和拖动
  const handleTimelineInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || frames.length === 0) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width)
    const percentage = x / rect.width
    const frameIndex = Math.min(Math.floor(percentage * frames.length), frames.length - 1)
    const frame = frames[frameIndex]
    setCurrentFrame(frame)

    // 滚动到对应的帧
    if (framesContainerRef.current) {
      const frameElement = framesContainerRef.current.children[frameIndex] as HTMLElement
      if (frameElement) {
        const containerWidth = framesContainerRef.current.clientWidth
        const frameLeft = frameElement.offsetLeft
        const frameWidth = frameElement.offsetWidth

        const scrollPosition = frameLeft - containerWidth / 2 + frameWidth / 2

        framesContainerRef.current.scrollTo({
          left: Math.max(0, scrollPosition),
          behavior: isDraggingTimeline ? 'auto' : 'smooth'
        })
      }
    }
  }

  // 处理时间轴拖动开始
  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    e.preventDefault() // 防止文本选择
    setIsDraggingTimeline(true)
    handleTimelineInteraction(e) // 立即更新当前帧
  }

  // 处理时间轴拖动结束
  const handleTimelineMouseUp = () => {
    setIsDraggingTimeline(false)
  }

  // 处理时间轴离开
  const handleTimelineMouseLeave = () => {
    if (isDraggingTimeline) {
      setIsDraggingTimeline(false)
    }
  }

  // 添加全局鼠标事件监听
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDraggingTimeline(false)
    }

    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [])

  // 处理拖拽开始
  const handleDragStart = (frame: FrameInfo, e: React.DragEvent) => {
    e.dataTransfer.setData('frame', JSON.stringify(frame))
    setIsDragging('start')
  }

  // 处理拖拽结束
  const handleDrop = (type: 'start' | 'end', e: React.DragEvent) => {
    e.preventDefault()
    const frame = JSON.parse(e.dataTransfer.getData('frame')) as FrameInfo
    if (type === 'start') {
      setStartFrame(frame)
    } else {
      setEndFrame(frame)
    }
    setIsDragging(null)
  }

  // 处理拖拽悬停
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <>
      {frames.length === 0 ? (
        <div className="upload-container">
          <Dragger {...uploadProps} style={{ padding: '20px' }}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽视频文件到此区域</p>
            <p className="ant-upload-hint">仅支持 MP4 格式</p>
          </Dragger>
          {loading && (
            <div className="upload-overlay">
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-text">正在处理视频... {progress.toFixed(1)}%</div>
            </div>
          )}
        </div>
      ) : (
        <div className="video-container">
          <Space style={{ marginBottom: '20px' }}>
            <Button onClick={handleReset} loading={loading}>
              重置
            </Button>
            {startFrame && endFrame && (
              <div>
                选择时长: {getDuration()} ms
                <div style={{ fontSize: '12px', color: '#666' }}>
                  (从 {formatDuration(startFrame.timestamp)} 到 {formatDuration(endFrame.timestamp)}
                  )
                </div>
              </div>
            )}
          </Space>

          {/* 拖放区域 */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flex: 1 }}>
            <div
              className={`frame-drop-zone ${isDragging === 'start' ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop('start', e)}
            >
              {startFrame ? (
                <img src={`file://${startFrame.path}`} alt="Start Frame" />
              ) : (
                <div>拖拽帧到这里设置为开始帧</div>
              )}
            </div>
            <div
              className={`frame-drop-zone ${isDragging === 'end' ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop('end', e)}
            >
              {endFrame ? (
                <img src={`file://${endFrame.path}`} alt="End Frame" />
              ) : (
                <div>拖拽帧到这里设置为结束帧</div>
              )}
            </div>
          </div>

          {/* 帧缩略图列表 */}
          <div className="frames-container" ref={framesContainerRef}>
            {frames.map((frame) => (
              <div
                key={frame.index}
                className={`frame-item ${
                  currentFrame?.index === frame.index ||
                  startFrame?.index === frame.index ||
                  endFrame?.index === frame.index
                    ? 'selected'
                    : ''
                }`}
                draggable
                onDragStart={(e) => handleDragStart(frame, e)}
                onClick={() => setCurrentFrame(frame)}
              >
                <img src={`file://${frame.path}`} alt={`Frame ${frame.index}`} />
                <div className="frame-timestamp">
                  <span>{formatDuration(frame.timestamp)}</span>
                </div>
                <div className="preview-image">
                  <img src={`file://${frame.path}`} alt={`Frame ${frame.index} Preview`} />
                </div>
              </div>
            ))}
          </div>

          {/* 时间轴 */}
          <div className="timeline-container">
            <div
              className="timeline"
              ref={timelineRef}
              onMouseDown={handleTimelineMouseDown}
              onMouseUp={handleTimelineMouseUp}
              onMouseLeave={handleTimelineMouseLeave}
              onMouseMove={(e) => {
                if (isDraggingTimeline) {
                  handleTimelineInteraction(e)
                }
              }}
            >
              {currentFrame && (
                <div
                  className={`timeline-slider ${isDraggingTimeline ? 'dragging' : ''}`}
                  style={{
                    left: `${(currentFrame.index / (frames.length - 1)) * 100}%`
                  }}
                >
                  <div className="preview-image">
                    <img src={`file://${currentFrame.path}`} alt="Preview" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default VideoFrameAnalyzer
