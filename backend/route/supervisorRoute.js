import express from 'express'
import {
  getSupervisorDashboardHandler,
  approveShiftHandler,
  rejectShiftHandler,
  approveLeaveHandler,
  rejectLeaveHandler,
  approveOvertimeHandler,
  rejectOvertimeHandler,
} from '../handlers/supervisorHandler.js'

const router = express.Router()

router.get('/supervisor/dashboard/:username', getSupervisorDashboardHandler)
router.patch('/supervisor/shift/:id/approve', approveShiftHandler)
router.patch('/supervisor/shift/:id/reject', rejectShiftHandler)
router.patch('/supervisor/leave/:id/approve', approveLeaveHandler)
router.patch('/supervisor/leave/:id/reject', rejectLeaveHandler)
router.patch('/supervisor/overtime/:id/approve', approveOvertimeHandler)
router.patch('/supervisor/overtime/:id/reject', rejectOvertimeHandler)

export default router
