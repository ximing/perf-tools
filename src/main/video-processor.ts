import { ipcMain } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'

// 设置 ffmpeg 和 ffprobe 路径
ffmpeg.setFfmpegPath(ffmpegPath.path)
ffmpeg.setFfprobePath(ffprobePath.path)

// 临时文件夹路径
const getTempPath = () => {
  const tempDir = path.join(app.getPath('temp'), 'video-frames')
  // 确保路径中的目录分隔符是正确的
  return path.normalize(tempDir)
}

// 确保临时目录存在
const ensureTempDir = async () => {
  const tempPath = getTempPath()
  try {
    const stat = await fs.stat(tempPath)
    if (stat.isDirectory()) {
      // 如果目录存在，先清空
      await fs.rm(tempPath, { recursive: true, force: true })
    } else {
      // 如果存在但不是目录，删除它
      await fs.unlink(tempPath)
    }
  } catch (error) {
    // 忽略目录不存在的错误
    if (error.code !== 'ENOENT') {
      console.error('Error checking temp directory:', error)
    }
  }

  // 创建新的临时目录
  try {
    await fs.mkdir(tempPath, { recursive: true })
  } catch (error) {
    console.error('Error creating temp directory:', error)
    throw error
  }

  return tempPath
}

// 清理临时文件
const cleanTempFiles = async () => {
  const tempPath = getTempPath()
  try {
    const stat = await fs.stat(tempPath)
    if (stat.isDirectory()) {
      await fs.rm(tempPath, { recursive: true, force: true })
    }
  } catch (error) {
    // 忽略目录不存在的错误
    if (error.code !== 'ENOENT') {
      console.error('清理临时文件失败:', error)
    }
  }
}

// 获取视频时长（秒）
const getVideoDuration = async (videoPath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err)
      else resolve(metadata.format.duration || 0)
    })
  })
}

// 设置IPC处理器
export function setupVideoProcessor(): void {
  // 处理视频文件
  ipcMain.handle('process-video', async (event, videoPath: string) => {
    try {
      const tempPath = await ensureTempDir()
      console.log('Temp directory created:', tempPath) // 添加日志

      const duration = await getVideoDuration(videoPath)
      let lastProgress = 0

      return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .on('progress', (progress) => {
            const currentProgress = Math.floor((progress.percent || 0) * 100) / 100
            if (currentProgress > lastProgress) {
              lastProgress = currentProgress
              event.sender.send('video-progress', currentProgress)
            }
          })
          .on('error', (err) => {
            console.error('FFmpeg error:', err)
            reject(err)
          })
          .on('end', async () => {
            try {
              const files = await fs.readdir(tempPath)
              console.log('Generated files:', files) // 添加日志

              const frameFiles = files
                .filter(f => f.endsWith('.jpg'))
                .sort((a, b) => {
                  const numA = parseInt(a.replace('frame-', '').replace('.jpg', ''))
                  const numB = parseInt(b.replace('frame-', '').replace('.jpg', ''))
                  return numA - numB
                })

              const frames = frameFiles.map((file, index) => {
                const filePath = path.join(tempPath, file)
                const timestamp = (index * duration * 1000) / frameFiles.length
                return { path: filePath, index, timestamp }
              })

              resolve(frames)
            } catch (error) {
              console.error('Error processing frames:', error)
              reject(error)
            }
          })
          .outputOptions([
            '-vsync', '0',
            '-frame_pts', '1',
            '-start_number', '1'
          ])
          .videoFilters([
            'select=1',  // 选择所有帧
            'setpts=N/TB' // 保持原始时间戳
          ])
          .output(path.join(tempPath, 'frame-%d.jpg'))
          .run()
      })
    } catch (error) {
      console.error('Process video error:', error)
      throw error
    }
  })

  // 清理临时文件
  ipcMain.handle('cleanup-frames', async () => {
    await cleanTempFiles()
  })
}
