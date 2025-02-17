import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Button, Space, message, Image } from 'antd'
import { InboxOutlined, CopyOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import './video.css'
import clsx from 'clsx'

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

function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  let previous = 0

  return function (...args: Parameters<T>) {
    const now = Date.now()

    if (!previous) {
      previous = now
    }

    const remaining = wait - (now - previous)

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }

      previous = now
      func.apply(this, args)
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now()
        timeout = null
        func.apply(this, args)
      }, remaining)
    }
  }
}

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

  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = milliseconds / 1000
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const ms = Math.floor((totalSeconds % 1) * 1000)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms
      .toString()
      .padStart(3, '0')}`
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
    accept: 'video/mp4,video/quicktime',
    showUploadList: false,
    beforeUpload: (file) => {
      const isValidVideo = file.type === 'video/mp4' || file.type === 'video/quicktime'
      if (!isValidVideo) {
        message.error('只支持 MP4 和 MOV 格式的视频')
        return false
      }
      processVideo(file)
      return false
    }
  }

  // 使用节流处理滚动
  const throttledScroll = useCallback(
    throttle((frameIndex: number) => {
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
    }, 100),
    [isDraggingTimeline]
  )

  // 处理时间轴点击和拖动
  const handleTimelineInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || frames.length === 0) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width)
    const percentage = x / rect.width
    const frameIndex = Math.min(Math.floor(percentage * frames.length), frames.length - 1)
    const frame = frames[frameIndex]
    setCurrentFrame(frame)
    // 调用节流后的滚动函数
    throttledScroll(frameIndex)
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

  // 添加复制函数
  const handleCopyDuration = () => {
    const duration = getDuration()
    if (duration) {
      navigator.clipboard.writeText(duration.toString())
      message.success('已复制到剪贴板')
    }
  }

  // 添加双击处理函数
  const handleDurationDoubleClick = () => {
    handleCopyDuration()
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
            <p className="ant-upload-hint">支持 MP4、MOV 格式</p>
          </Dragger>
          {loading && (
            <div className="upload-overlay">
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress / 100}%` }} />
              </div>
              <div className="progress-text">正在处理视频... {(progress / 100).toFixed(1)}%</div>
            </div>
          )}
        </div>
      ) : (
        <div className="video-container">
          <div className="video-header">
            <div className="duration-display-container">
              {startFrame && endFrame && (
                <Space>
                  <div className="duration-display" onClick={handleDurationDoubleClick}>
                    <span>选择时长: {getDuration()} ms</span>
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      size="small"
                      className="copy-button"
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    (从 {formatDuration(startFrame.timestamp)} 到{' '}
                    {formatDuration(endFrame.timestamp)})
                  </div>
                </Space>
              )}
            </div>
            <Button className="reset-button" onClick={handleReset} loading={loading}>
              重新上传视频
            </Button>
          </div>
          {/* 拖放区域 */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flex: 1 }}>
            <div
              className={`frame-drop-zone ${isDragging === 'start' ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop('start', e)}
              onClick={() => {
                if (startFrame) {
                  setCurrentFrame(startFrame)
                  throttledScroll(startFrame.index)
                }
              }}
            >
              <h3>开始帧</h3>
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
              onClick={() => {
                if (endFrame) {
                  setCurrentFrame(endFrame)
                  throttledScroll(endFrame.index)
                }
              }}
            >
              <h3>结束帧</h3>
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
                className={clsx(
                  'frame-item',
                  currentFrame?.index === frame.index ||
                    startFrame?.index === frame.index ||
                    endFrame?.index === frame.index
                    ? 'selected'
                    : '',
                  {
                    'frame-item-start': startFrame?.index === frame.index,
                    'frame-item-end': endFrame?.index === frame.index
                  }
                )}
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
                  <div className="preview-image" data-time={formatDuration(currentFrame.timestamp)}>
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
