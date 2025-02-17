import { ipcMain } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'
import { logger } from './utils/logger'

// 获取正确的二进制文件路径
const getBinaryPath = (originalPath: string): string => {
  if (app.isPackaged) {
    // 在打包环境中，修正路径
    return path.join(process.resourcesPath, 'app.asar.unpacked', originalPath.split('app.asar/')[1])
  }
  return originalPath
}

// 设置 ffmpeg 和 ffprobe 路径
const ffmpegBinaryPath = getBinaryPath(ffmpegPath.path)
const ffprobeBinaryPath = getBinaryPath(ffprobePath.path)

ffmpeg.setFfmpegPath(ffmpegBinaryPath)
ffmpeg.setFfprobePath(ffprobeBinaryPath)

logger.info('FFmpeg paths configured', {
  ffmpegPath: ffmpegBinaryPath,
  ffprobePath: ffprobeBinaryPath,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath
})

// 临时文件夹路径
const getTempPath = (): string => {
  let tempDir = path.join(app.getPath('temp'), 'video-frames')
  const normalizedPath = path.normalize(tempDir)
  logger.debug('Temp directory path', { path: normalizedPath, isPackaged: app.isPackaged })
  return normalizedPath
}

// 确保临时目录存在
const ensureTempDir = async (): Promise<string> => {
  const tempPath = getTempPath()
  try {
    await fs.mkdir(path.dirname(tempPath), { recursive: true })

    const stat = await fs.stat(tempPath)
    if (stat.isDirectory()) {
      logger.debug('Cleaning existing temp directory', { path: tempPath })
      await fs.rm(tempPath, { recursive: true, force: true })
    } else {
      logger.warn('Temp path exists but is not a directory, removing', { path: tempPath })
      await fs.unlink(tempPath)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('Error checking temp directory', error)
    }
  }

  try {
    await fs.mkdir(tempPath, { recursive: true })
    logger.info('Temp directory created', { path: tempPath })
  } catch (error) {
    logger.error('Failed to create temp directory', error)
    throw error
  }

  return tempPath
}

// 清理临时文件
const cleanTempFiles = async (): Promise<void> => {
  const tempPath = getTempPath()
  try {
    const stat = await fs.stat(tempPath)
    if (stat.isDirectory()) {
      // 先删除目录内的所有文件
      const files = await fs.readdir(tempPath)
      for (const file of files) {
        const filePath = path.join(tempPath, file)
        await fs.unlink(filePath)
      }
      // 然后删除目录本身
      await fs.rmdir(tempPath)
      logger.info('Temp directory cleaned', { path: tempPath })
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('Failed to clean temp directory', error)
      throw error
    }
  }
}

// 获取视频时长（秒）
const getVideoDuration = async (videoPath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.error('Failed to get video duration', err)
        reject(err)
      } else {
        const duration = metadata.format.duration || 0
        logger.debug('Video duration retrieved', { path: videoPath, duration })
        resolve(duration)
      }
    })
  })
}

interface Frame {
  path: string
  index: number
  timestamp: number
}

// 设置IPC处理器
export function setupVideoProcessor(): void {
  // 处理视频文件
  ipcMain.handle('process-video', async (event, videoPath: string): Promise<Frame[]> => {
    logger.info('Starting video processing', { path: videoPath })
    try {
      // 确保临时目录是干净的
      await cleanTempFiles()
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
              // logger.debug('Processing progress', { progress: currentProgress })
            }
          })
          .on('error', (err) => {
            logger.error('FFmpeg processing error', err)
            reject(err)
          })
          .on('end', async () => {
            try {
              const files = await fs.readdir(tempPath)
              logger.debug('Generated frame files', { count: files.length })

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

              logger.info('Video processing completed', {
                frameCount: frames.length,
                videoPath,
                tempPath
              })
              resolve(frames)
            } catch (error) {
              logger.error('Error processing frames', error)
              reject(error)
            }
          })
          .outputOptions([
            '-vsync', '0',
            '-frame_pts', '1',
            '-start_number', '1'
          ])
          .videoFilters([
            'select=1',
            'setpts=N/TB'
          ])
          .output(path.join(tempPath, 'frame-%d.jpg'))
          .run()
      })
    } catch (error) {
      logger.error('Video processing failed', error)
      throw error
    }
  })

  // 清理临时文件
  ipcMain.handle('cleanup-frames', async () => {
    logger.info('Cleaning up frame files')
    await cleanTempFiles()
  })
}
