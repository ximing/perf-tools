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
const getTempPath = () => path.join(app.getPath('temp'), 'video-frames')

// 确保临时目录存在
const ensureTempDir = async () => {
  const tempPath = getTempPath()
  try {
    await fs.access(tempPath)
    // 如果目录存在，先清空
    await fs.rm(tempPath, { recursive: true, force: true })
  } catch {}
  await fs.mkdir(tempPath, { recursive: true })
  return tempPath
}

// 清理临时文件
const cleanTempFiles = async () => {
  const tempPath = getTempPath()
  try {
    await fs.rm(tempPath, { recursive: true, force: true })
  } catch (error) {
    console.error('清理临时文件失败:', error)
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
          .on('end', async () => {
            try {
              const files = await fs.readdir(tempPath)
              const frameFiles = files
                .filter(f => f.endsWith('.jpg'))
                .sort((a, b) => {
                  const numA = parseInt(a.replace('frame-', '').replace('.jpg', ''))
                  const numB = parseInt(b.replace('frame-', '').replace('.jpg', ''))
                  return numA - numB
                })

              const frames = frameFiles.map((file, index) => {
                const filePath = path.join(tempPath, file)
                // 根据视频总时长和帧索引计算时间戳
                const timestamp = (index * duration * 1000) / frameFiles.length

                return {
                  path: filePath,
                  index,
                  timestamp
                }
              })

              resolve(frames)
            } catch (error) {
              reject(error)
            }
          })
          .on('error', (err) => {
            console.error('FFmpeg error:', err)
            reject(err)
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
