import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Upload, Button, Space, message, Image, Dropdown } from 'antd'
import { InboxOutlined, CopyOutlined, BulbOutlined } from '@ant-design/icons'
import type { UploadProps, MenuProps } from 'antd'
import './video.css'
import clsx from 'clsx'

interface FrameInfo {
  path: string
  timestamp: number
  index: number
}

// 添加视频信息接口
interface VideoInfo {
  name: string
  duration: string
  frameCount: number
}

declare global {
  interface Window {
    electronAPI: {
      processVideo: (path: string) => Promise<FrameInfo[]>
      cleanupFrames: () => Promise<void>
      onProgress: (callback: (progress: number) => void) => void
      removeProgressListener: () => void
      getTheme: () => Promise<'system' | 'light' | 'dark'>
      setTheme: (theme: 'system' | 'light' | 'dark') => Promise<void>
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

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = milliseconds / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const ms = Math.floor((totalSeconds % 1) * 1000)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms
    .toString()
    .padStart(3, '0')}`
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
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const rafRef = useRef<number>()
  const lastFrameIndexRef = useRef<number>(-1)

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

  // 初始化主题
  useEffect(() => {
    window.electronAPI.getTheme().then((savedTheme) => {
      setTheme(savedTheme)
      document.documentElement.setAttribute('data-theme', savedTheme)
    })
  }, [])

  const handleReset = async (): Promise<void> => {
    try {
      setLoading(true)

      // 1. 先重置所有状态
      setFrames([])
      setStartFrame(null)
      setEndFrame(null)
      setCurrentFrame(null)
      setProgress(0)
      setIsDragging(null)
      setIsDraggingTimeline(false)

      // 2. 清理临时文件
      await window.electronAPI.cleanupFrames()

      // 3. 等待一小段时间确保清理完成
      await new Promise((resolve) => setTimeout(resolve, 100))

      message.success('重置成功')
    } catch (error) {
      console.error('Reset error:', error)
      message.error('重置失败')
    } finally {
      setLoading(false)
    }
  }

  const processVideo = async (file: File): Promise<void> => {
    try {
      setLoading(true)
      setProgress(0)

      await window.electronAPI.cleanupFrames()
      const frames = await window.electronAPI.processVideo(file.path)
      console.log('frames', frames)
      frames.forEach((frame) => {
        frame.path = `${frame.path}?t=${Date.now()}`
      })
      if (!Array.isArray(frames) || frames.length === 0) {
        throw new Error('视频处理结果无效')
      }

      // 设置视频信息
      const duration = frames[frames.length - 1].timestamp
      setVideoInfo({
        name: file.name,
        duration: formatDuration(duration),
        frameCount: frames.length
      })

      setFrames(frames)
      setCurrentFrame(frames[0])
      message.success('视频帧提取完成')
    } catch (error) {
      console.error('Process video error:', error)
      message.error('处理视频时出错')
      // 出错时清理状态
      setFrames([])
      setCurrentFrame(null)
      setStartFrame(null)
      setEndFrame(null)
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  const getDuration = useCallback(() => {
    if (startFrame && endFrame) {
      const duration = endFrame.timestamp - startFrame.timestamp
      return parseInt(duration.toFixed(0))
    }
    return ''
  }, [startFrame, endFrame])

  const uploadProps: UploadProps = useMemo(
    () => ({
      name: 'file',
      multiple: false,
      accept: 'video/mp4,video/quicktime',
      showUploadList: false,
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      beforeUpload: (file) => {
        const isValidVideo = file.type === 'video/mp4' || file.type === 'video/quicktime'
        if (!isValidVideo) {
          message.error('只支持 MP4 和 MOV 格式的视频')
          return false
        }
        processVideo(file)
        return false
      }
    }),
    [processVideo]
  )

  // 使用 RAF 优化的滚动函数
  const smoothScroll = useCallback(
    (frameIndex: number) => {
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
    },
    [isDraggingTimeline]
  )

  // 处理时间轴交互
  const handleTimelineInteraction = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timelineRef.current || frames.length === 0) return

      const rect = timelineRef.current.getBoundingClientRect()
      const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width)
      const percentage = x / rect.width
      const frameIndex = Math.min(Math.floor(percentage * frames.length), frames.length - 1)

      // 避免重复处理相同帧
      if (frameIndex === lastFrameIndexRef.current) return
      lastFrameIndexRef.current = frameIndex

      const frame = frames[frameIndex]
      setCurrentFrame(frame)

      // 取消之前的 RAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }

      // 使用 RAF 处理滚动
      rafRef.current = requestAnimationFrame(() => {
        smoothScroll(frameIndex)
      })
    },
    [frames, smoothScroll]
  )

  // 清理 RAF
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  // 处理时间轴拖动开始
  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDraggingTimeline(true)
      handleTimelineInteraction(e)
    },
    [handleTimelineInteraction]
  )

  // 处理时间轴拖动结束
  const handleTimelineMouseUp = useCallback(() => {
    setIsDraggingTimeline(false)
    lastFrameIndexRef.current = -1 // 重置帧索引
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // 处理时间轴离开
  const handleTimelineMouseLeave = useCallback(() => {
    if (isDraggingTimeline) {
      setIsDraggingTimeline(false)
    }
  }, [isDraggingTimeline, setIsDraggingTimeline])

  // 添加全局鼠标事件监听
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const handleGlobalMouseUp = () => {
      setIsDraggingTimeline(false)
    }

    window.addEventListener('mouseup', handleGlobalMouseUp)
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [])

  // 处理拖拽开始
  const handleDragStart = useCallback(
    (frame: FrameInfo, e: React.DragEvent) => {
      // 设置拖拽数据
      e.dataTransfer.setData('frame-index', frame.index.toString())
      // 清除之前的拖拽状态
      setIsDragging(null)
    },
    []
  )

  // 处理拖拽进入
  const handleDragEnter = useCallback(
    (zone: 'start' | 'end') => {
      setIsDragging(zone)
    },
    []
  )

  // 处理拖拽离开
  const handleDragLeave = useCallback(() => {
    setIsDragging(null)
  }, [])

  // 处理拖拽结束
  const handleDrop = useCallback(
    (type: 'start' | 'end', e: React.DragEvent) => {
      e.preventDefault()
      const frameIndex = parseInt(e.dataTransfer.getData('frame-index'))
      const frame = frames[frameIndex]

      if (frame) {
        if (type === 'start') {
          setStartFrame(frame)
        } else {
          setEndFrame(frame)
        }
      }
      setIsDragging(null)
    },
    [frames, setStartFrame, setEndFrame]
  )

  // 处理拖拽悬停
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // 添加复制函数
  const handleCopyDuration = useCallback(() => {
    const duration = getDuration()
    if (duration) {
      navigator.clipboard.writeText(duration.toString())
      message.success('已复制到剪贴板')
    }
  }, [getDuration])

  // 处理主题切换
  const handleThemeChange = async (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme)
    await window.electronAPI.setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  const themeItems: MenuProps['items'] = [
    {
      key: 'system',
      label: '跟随系统',
      onClick: () => handleThemeChange('system')
    },
    {
      key: 'light',
      label: '浅色',
      onClick: () => handleThemeChange('light')
    },
    {
      key: 'dark',
      label: '深色',
      onClick: () => handleThemeChange('dark')
    }
  ]

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
          <Dropdown menu={{ items: themeItems }} placement="bottomRight">
            <Button type="text" icon={<BulbOutlined />} className="theme-button" />
          </Dropdown>
        </div>
      ) : (
        <div className="video-container">
          <div className="video-header">
            <div className="video-info">
              {videoInfo && (
                <>
                  <div className="video-name">
                    <span className="label">视频名称:</span>
                    <span className="value">{videoInfo.name}</span>
                  </div>
                  <div className="video-stats">
                    <span className="stat-item">
                      <span className="label">总时长:</span>
                      <span className="value">{videoInfo.duration}</span>
                    </span>
                    <span className="stat-item">
                      <span className="label">总帧数:</span>
                      <span className="value">{videoInfo.frameCount}</span>
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="duration-display-container">
              {startFrame && endFrame && (
                <Space>
                  <div className="duration-display" onClick={handleCopyDuration}>
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
            <Space>
              <Button className="reset-button" onClick={handleReset} loading={loading}>
                重新上传视频
              </Button>
              <Dropdown menu={{ items: themeItems }} placement="bottomRight">
                <Button type="text" icon={<BulbOutlined />} className="theme-button" />
              </Dropdown>
            </Space>
          </div>
          {/* 拖放区域 */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '5px', flex: 1 }}>
            <div
              className={`frame-drop-zone ${isDragging === 'start' ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop('start', e)}
              onDragEnter={() => handleDragEnter('start')}
              onDragLeave={handleDragLeave}
              onClick={() => {
                if (startFrame) {
                  setCurrentFrame(startFrame)
                  smoothScroll(startFrame.index)
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
              onDragEnter={() => handleDragEnter('end')}
              onDragLeave={handleDragLeave}
              onClick={() => {
                if (endFrame) {
                  setCurrentFrame(endFrame)
                  smoothScroll(endFrame.index)
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
          <div
            className="timeline-container"
            ref={timelineRef}
            onMouseDown={handleTimelineMouseDown}
            onMouseUp={handleTimelineMouseUp}
            onMouseLeave={handleTimelineMouseLeave}
            onMouseMove={isDraggingTimeline ? handleTimelineInteraction : undefined}
          >
            <div className="timeline">
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
