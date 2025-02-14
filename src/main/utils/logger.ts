import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'

class Logger {
  private logPath: string
  private stream: fs.WriteStream | null = null
  private maxLogFiles = 5  // 保留的日志文件数量
  private maxLogSize = 10 * 1024 * 1024  // 单个日志文件最大大小（10MB）

  constructor() {
    // 在系统临时目录下创建应用专用的日志目录
    const appTempDir = path.join(app.getPath('temp'), 'perf-tools', 'logs')
    this.logPath = path.join(appTempDir, 'app.log')
    this.initLogFile()
    this.cleanOldLogs()
  }

  private initLogFile() {
    try {
      const logDir = path.dirname(this.logPath)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }

      // 检查当前日志文件大小
      if (fs.existsSync(this.logPath)) {
        const stats = fs.statSync(this.logPath)
        if (stats.size >= this.maxLogSize) {
          this.rotateLog()
        }
      }

      this.stream = fs.createWriteStream(this.logPath, { flags: 'a' })
    } catch (error) {
      console.error('Failed to initialize log file:', error)
    }
  }

  private rotateLog() {
    const logDir = path.dirname(this.logPath)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    // 关闭当前日志流
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }

    // 重命名当前日志文件
    if (fs.existsSync(this.logPath)) {
      const newPath = path.join(logDir, `app-${timestamp}.log`)
      fs.renameSync(this.logPath, newPath)
    }

    // 删除旧日志文件
    this.cleanOldLogs()

    // 创建新的日志流
    this.stream = fs.createWriteStream(this.logPath, { flags: 'a' })
  }

  private cleanOldLogs() {
    try {
      const logDir = path.dirname(this.logPath)
      if (!fs.existsSync(logDir)) return

      const files = fs.readdirSync(logDir)
        .filter(file => file.startsWith('app-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          time: fs.statSync(path.join(logDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)  // 按时间降序排序

      // 删除超出数量限制的旧日志文件
      files.slice(this.maxLogFiles - 1).forEach(file => {
        try {
          fs.unlinkSync(file.path)
        } catch (error) {
          console.error(`Failed to delete old log file: ${file.path}`, error)
        }
      })

      // 删除7天前的日志文件
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
      files.forEach(file => {
        if (file.time < sevenDaysAgo) {
          try {
            fs.unlinkSync(file.path)
          } catch (error) {
            console.error(`Failed to delete old log file: ${file.path}`, error)
          }
        }
      })
    } catch (error) {
      console.error('Failed to clean old logs:', error)
    }
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const dataStr = data ? `\nData: ${JSON.stringify(data, null, 2)}` : ''
    return `[${timestamp}] [${level}] ${message}${dataStr}\n`
  }

  private checkLogSize() {
    if (this.stream && fs.existsSync(this.logPath)) {
      const stats = fs.statSync(this.logPath)
      if (stats.size >= this.maxLogSize) {
        this.rotateLog()
      }
    }
  }

  info(message: string, data?: any) {
    this.checkLogSize()
    const logMessage = this.formatMessage('INFO', message, data)
    console.log(logMessage)
    this.stream?.write(logMessage)
  }

  error(message: string, error?: any) {
    this.checkLogSize()
    const logMessage = this.formatMessage('ERROR', message, {
      message: error?.message,
      stack: error?.stack
    })
    console.error(logMessage)
    this.stream?.write(logMessage)
  }

  warn(message: string, data?: any) {
    this.checkLogSize()
    const logMessage = this.formatMessage('WARN', message, data)
    console.warn(logMessage)
    this.stream?.write(logMessage)
  }

  debug(message: string, data?: any) {
    if (!app.isPackaged) {
      this.checkLogSize()
      const logMessage = this.formatMessage('DEBUG', message, data)
      console.debug(logMessage)
      this.stream?.write(logMessage)
    }
  }

  close() {
    this.stream?.end()
  }
}

export const logger = new Logger()

// 确保在应用退出时关闭日志流
app.on('quit', () => {
  logger.close()
})
