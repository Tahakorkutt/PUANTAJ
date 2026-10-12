import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import userRoute from './route/userRoute.js'
import attendanceRoute from './route/attendanceRoute.js'
import leaveRoute from './route/leaveRoute.js'
import shiftRoute from './route/shiftRoute.js'
import overtimeRoute from './route/overtimeRoute.js'
import adminRoute from './route/adminRoute.js'
import supervisorRoute from './route/supervisorRoute.js'
import chatRoute from './route/chatRoute.js'
import { createUsersTable, normalizeUserDepartments } from './models/User.js'
import { createAttendanceTable } from './models/Attendance.js'
import { createLeaveTable } from './models/Leave.js'
import { createShiftTable } from './models/Shift.js'
import { createOvertimeTable } from './models/Overtime.js'
import { createDepartmentChatTable, createDirectChatTable } from './models/ChatMessage.js'
import { ensureAdminUser } from './service/adminService.js'
import { ensureSupervisorUser } from './service/supervisorService.js'

const app = express()
const httpServer = createServer(app)
const port = 5001
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

globalThis.__PUANTAJ_IO__ = io

app.use(cors())
app.use(express.json())

app.use('/api', userRoute)
app.use('/api', attendanceRoute)
app.use('/api', leaveRoute)
app.use('/api', shiftRoute)
app.use('/api', overtimeRoute)
app.use('/api', adminRoute)
app.use('/api', supervisorRoute)
app.use('/api', chatRoute)

app.get('/', (req, res) => {
  res.json({
    message: 'Puantaj backend çalışıyor',
  })
})

io.on('connection', (socket) => {
  socket.on('join-chat', ({ username }) => {
    if (!username) {
      return
    }

    socket.join(`user:${username}`)
  })

  socket.on('leave-chat', ({ username }) => {
    if (!username) {
      return
    }

    socket.leave(`user:${username}`)
  })
})

const emitChatMessage = (message) => {
  if (!message?.sender || !message?.receiver) {
    return
  }

  io.to(`user:${message.sender}`).emit('chat-message', message)
  io.to(`user:${message.receiver}`).emit('chat-message', message)
}

const startServer = async () => {
  try {
    await createUsersTable()
    await normalizeUserDepartments()
    await createAttendanceTable()
    await createLeaveTable()
    await createShiftTable()
    await createOvertimeTable()
    await createDepartmentChatTable()
    await createDirectChatTable()
    await ensureAdminUser()
    await ensureSupervisorUser()
    httpServer.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Server startup error:', error)
    process.exit(1)
  }
}

startServer()
