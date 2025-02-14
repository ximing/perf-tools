import React, { useState, useEffect } from 'react';
import { Upload, Button, Space, message, Image } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';

interface FrameInfo {
  path: string;
  timestamp: number;
  index: number;
}

declare global {
  interface Window {
    electronAPI: {
      processVideo: (path: string) => Promise<FrameInfo[]>;
      cleanupFrames: () => Promise<void>;
      onProgress: (callback: (progress: number) => void) => void;
      removeProgressListener: () => void;
    };
  }
}

const { Dragger } = Upload;

const VideoFrameAnalyzer: React.FC = () => {
  const [frames, setFrames] = useState<FrameInfo[]>([]);
  const [startFrame, setStartFrame] = useState<FrameInfo | null>(null);
  const [endFrame, setEndFrame] = useState<FrameInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 设置进度监听器
    window.electronAPI.onProgress((progress) => {
      setProgress(progress);
    });

    // 清理函数
    return () => {
      window.electronAPI.removeProgressListener();
    };
  }, []);

  const processVideo = async (file: File) => {
    try {
      setLoading(true);
      setProgress(0);
      const frames = await window.electronAPI.processVideo(file.path);
      setFrames(frames);
      message.success('视频帧提取完成');
    } catch (error) {
      message.error('处理视频时出错');
      console.error(error);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleFrameClick = (frame: FrameInfo) => {
    if (!startFrame) {
      setStartFrame(frame);
    } else if (!endFrame) {
      if (frame.index < startFrame.index) {
        setStartFrame(frame);
      } else {
        setEndFrame(frame);
      }
    } else {
      setStartFrame(frame);
      setEndFrame(null);
    }
  };

  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = milliseconds / 1000
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const ms = Math.floor((totalSeconds % 1) * 1000)

    const parts = []
    if (minutes > 0) {
      parts.push(`${minutes}分`)
    }
    if (seconds > 0 || minutes > 0) {
      parts.push(`${seconds}秒`)
    }
    parts.push(`${ms}毫秒`)

    return parts.join('')
  }

  const getDuration = () => {
    if (startFrame && endFrame) {
      const duration = endFrame.timestamp - startFrame.timestamp
      return formatDuration(duration)
    }
    return ''
  }

  const handleReset = async () => {
    setFrames([]);
    setStartFrame(null);
    setEndFrame(null);
    await window.electronAPI.cleanupFrames();
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: 'video/mp4',
    showUploadList: false,
    beforeUpload: (file) => {
      processVideo(file);
      return false;
    },
  };

  return (
    <div style={{ padding: '20px' }}>
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
              <div className="progress-text">
                正在处理视频... {progress.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <Space style={{ marginBottom: '20px' }}>
            <Button onClick={handleReset} loading={loading}>重置</Button>
            {startFrame && endFrame && (
              <div>
                选择时长: {getDuration()}
                <div style={{ fontSize: '12px', color: '#666' }}>
                  (从 {formatDuration(startFrame.timestamp)} 到 {formatDuration(endFrame.timestamp)})
                </div>
              </div>
            )}
          </Space>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {frames.map((frame) => (
              <div
                key={frame.index}
                style={{
                  border: startFrame?.index === frame.index || endFrame?.index === frame.index
                    ? '2px solid #1890ff'
                    : '2px solid transparent',
                  cursor: 'pointer'
                }}
                onClick={() => handleFrameClick(frame)}
              >
                <Image
                  width={160}
                  src={`file://${frame.path}`}
                  preview={false}
                />
                <div style={{ textAlign: 'center' }}>
                  {formatDuration(frame.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoFrameAnalyzer;
