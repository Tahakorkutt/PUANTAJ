import express from 'express'
import { attendanceActionHandler, getAttendanceHistoryHandler } from '../handlers/attendanceHandler.js'

const router = express.Router()

router.post('/attendance', attendanceActionHandler)
router.post('/attendance/scan', attendanceActionHandler)
router.get('/attendance/:username', getAttendanceHistoryHandler)

export default router
